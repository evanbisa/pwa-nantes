-- Offres réservées aux comptes (14 novembre 2026) : sans compte, la carte montre 3 offres, les autres sont floutées.
-- Étape 1 : la fonction guest_promotions() pour les visiteurs. Étape 2 (migration suivante, appliquée une fois le site
-- passé à cette fonction) : plus de lecture directe de la table des offres sans compte.
--
-- guest_promotions() renvoie toutes les offres en cours des fiches en ligne (pour les compter et les signaler sur la
-- carte), mais le titre et le détail de 3 seulement ; les autres arrivent sans texte (locked = true).
-- Les 3 offres ouvertes sont les mêmes pour tous les visiteurs (aucune position en paramètre : impossible d'en voir
-- d'autres en trichant sur sa position) : la plus récente de chaque restaurant d'abord (3 restaurants différents quand
-- c'est possible), puis les plus récentes.
-- Comme les autres fonctions à droits élevés : le calcul dans « private » (non exposé par l'API), un relais sans
-- privilège dans « public ».
create function private.guest_promotions()
returns table (id uuid, merchant_id uuid, kind public.promotion_kind, title text, details text, created_at timestamptz, ends_at timestamptz, locked boolean)
language sql stable security definer set search_path = '' as $$
  with live as (
    select p.id, p.merchant_id, p.kind, p.title, p.details, p.created_at, p.ends_at
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
    l.created_at, l.ends_at, u.id is null
  from live l left join unlocked u on u.id = l.id
$$;
revoke execute on function private.guest_promotions() from public;
grant execute on function private.guest_promotions() to anon, authenticated;

create function public.guest_promotions()
returns table (id uuid, merchant_id uuid, kind public.promotion_kind, title text, details text, created_at timestamptz, ends_at timestamptz, locked boolean)
language sql stable security invoker set search_path = '' as $$
  select * from private.guest_promotions()
$$;
comment on function public.guest_promotions() is 'Offres en cours pour les visiteurs sans compte : texte de 3 offres seulement, les autres verrouillées (locked, sans titre ni détail).';
revoke execute on function public.guest_promotions() from public, anon, authenticated;
grant execute on function public.guest_promotions() to anon, authenticated;
