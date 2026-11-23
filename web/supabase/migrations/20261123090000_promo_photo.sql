-- Photo d'une offre (23 novembre 2026) : le restaurateur peut joindre une photo à sa promotion ; elle s'affiche à droite
-- de l'offre dans « Offres autour de moi ».
-- La photo est dans le stockage public « photos », dans le dossier de la fiche (mêmes règles que les photos de la fiche :
-- dépôt par son seul propriétaire, JPG/PNG/WebP, 40 fichiers au plus par fiche). La base n'accepte qu'un chemin de ce
-- dossier-là : impossible de pointer vers la photo d'un autre restaurant ou vers une adresse extérieure.
alter table public.promotions add column photo_path text;
alter table public.promotions add constraint promotions_photo_path_check check (
  photo_path is null or (
    photo_path ~ '^[0-9a-f-]{36}/promo-[A-Za-z0-9_-]{6,64}\.(jpg|jpeg|png|webp)$'
    and split_part(photo_path, '/', 1) = merchant_id::text
  )
);
grant insert (photo_path), select (photo_path) on public.promotions to authenticated;

-- Visiteurs sans compte : la photo suit le texte (visible pour les 3 offres ouvertes, jamais pour les offres verrouillées).
drop function public.guest_promotions();
drop function private.guest_promotions();
create function private.guest_promotions()
returns table (id uuid, merchant_id uuid, kind public.promotion_kind, title text, details text, created_at timestamptz, ends_at timestamptz, locked boolean, photo_path text)
language sql stable security definer set search_path = '' as $$
  with live as (
    select p.id, p.merchant_id, p.kind, p.title, p.details, p.created_at, p.ends_at, p.photo_path
    from public.promotions p
    where (p.ends_at is null or p.ends_at > now()) and private.merchant_is_live(p.merchant_id)
  ), ranked as (
    select l.id, l.created_at, row_number() over (partition by l.merchant_id order by l.created_at desc, l.id) as rang
    from live l
  ), unlocked as (
    select r.id from ranked r order by r.rang, r.created_at desc, r.id limit 3
  )
  select l.id, l.merchant_id, l.kind,
    case when u.id is not null then l.title end,
    case when u.id is not null then l.details end,
    l.created_at, l.ends_at, u.id is null,
    case when u.id is not null then l.photo_path end
  from live l left join unlocked u on u.id = l.id
$$;
revoke execute on function private.guest_promotions() from public;
grant execute on function private.guest_promotions() to anon, authenticated;

create function public.guest_promotions()
returns table (id uuid, merchant_id uuid, kind public.promotion_kind, title text, details text, created_at timestamptz, ends_at timestamptz, locked boolean, photo_path text)
language sql stable security invoker set search_path = '' as $$
  select * from private.guest_promotions()
$$;
comment on function public.guest_promotions() is 'Offres en cours pour les visiteurs sans compte : texte et photo de 3 offres seulement, les autres verrouillées (locked, sans titre, détail ni photo).';
revoke execute on function public.guest_promotions() from public, anon, authenticated;
grant execute on function public.guest_promotions() to anon, authenticated;
