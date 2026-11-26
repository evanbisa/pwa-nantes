-- Avis vérifiés (audit du 25 novembre 2026).
-- Un avis est « vérifié » quand son auteur a une visite validée en caisse chez ce restaurant (QR code FlashMiam scanné
-- par le restaurateur). La loi (article L111-7-2 du Code de la consommation) demande d'indiquer si les avis sont
-- contrôlés et comment : le badge et l'explication de la fiche s'appuient sur cette colonne, tenue à jour par la base.
-- Option du restaurateur : n'accepter que les avis de clients dont la visite a été validée.

alter table public.reviews add column if not exists verified boolean not null default false;
grant select (verified) on public.reviews to anon, authenticated;

-- À l'écriture d'un avis : vérifié si une visite de l'auteur existe déjà (jamais choisi par le navigateur)
create or replace function private.reviews_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.verified := exists (select 1 from public.visits v where v.user_id = new.user_id and v.merchant_id = new.merchant_id);
  return new;
end;
$$;
revoke all on function private.reviews_verified() from public;
drop trigger if exists reviews_verified on public.reviews;
create trigger reviews_verified before insert or update of rating, comment on public.reviews
  for each row execute function private.reviews_verified();

-- Visite validée après l'avis : l'avis de ce client chez ce restaurant devient vérifié
create or replace function private.visits_verify_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.reviews r set verified = true
  where r.user_id = new.user_id and r.merchant_id = new.merchant_id and not r.verified;
  return null;
end;
$$;
revoke all on function private.visits_verify_review() from public;
drop trigger if exists visits_verify_review on public.visits;
create trigger visits_verify_review after insert on public.visits
  for each row execute function private.visits_verify_review();

-- Avis existants
update public.reviews r set verified = true
where exists (select 1 from public.visits v where v.user_id = r.user_id and v.merchant_id = r.merchant_id);

-- Option du restaurateur : avis réservés aux visites validées
alter table public.merchants add column if not exists reviews_verified_only boolean not null default false;
grant select (reviews_verified_only) on public.merchants to anon, authenticated;
grant update (reviews_verified_only) on public.merchants to authenticated;

create or replace function private.can_review(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.merchants m
    join public.profiles p on p.id = (select auth.uid())
    where m.id = p_merchant_id and m.status = 'published' and m.is_open and m.user_id <> p.id and p.role = 'student'
      and (not m.reviews_verified_only
           or exists (select 1 from public.visits v where v.user_id = p.id and v.merchant_id = m.id))
  )
$$;
