-- Offres : date et heure de fin au choix, et créneau de validité (jours de la semaine, heure de début et de fin).
--   valid_days : jours où l'offre vaut (0 = dimanche … 6 = samedi) ; null = tous les jours
--   valid_from / valid_to : heures de la journée (heure de Paris) ; null = toute la journée
-- Ex. : mardi de 12 h à 14 h → valid_days = {2}, valid_from = 12:00, valid_to = 14:00.
alter table public.promotions
  add column if not exists valid_days smallint[],
  add column if not exists valid_from time,
  add column if not exists valid_to time;
alter table public.promotions
  add constraint promotions_valid_days_check
    check (valid_days is null or (cardinality(valid_days) between 1 and 7 and valid_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])),
  add constraint promotions_valid_hours_check
    check ((valid_from is null) = (valid_to is null) and (valid_from is null or valid_from < valid_to));
grant insert (valid_days, valid_from, valid_to) on public.promotions to authenticated;

-- Fin de l'offre : celle choisie par le restaurateur (à venir, un an au plus) ; sinon, pour les promos du jour et de la
-- semaine, ce soir à minuit ou dimanche soir (heure de Paris), comme avant.
create or replace function private.promotions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if new.ends_at is not null then
    if new.ends_at > now() + interval '366 days' then
      raise exception 'Une promotion dure un an au plus.' using errcode = 'check_violation';
    end if;
  elsif new.kind = 'day' then
    new.ends_at := ((v_today + 1)::timestamp at time zone 'Europe/Paris');
  elsif new.kind::text in ('week', 'weekend') then
    new.ends_at := ((v_today + 1 + (7 - extract(isodow from v_today)::int))::timestamp at time zone 'Europe/Paris');
  end if;
  if (select count(*) from public.promotions p where p.merchant_id = new.merchant_id and (p.ends_at is null or p.ends_at > now())) >= 6 then
    raise exception 'Six promotions en cours au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Depuis le site, une date de fin doit être à venir (droits de l'appelant : current_user est le rôle du site)
create or replace function private.promotions_ends_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and new.ends_at is not null and new.ends_at <= now() then
    raise exception 'Choisissez une date de fin à venir.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.promotions_ends_check() from public;
grant execute on function private.promotions_ends_check() to anon, authenticated, service_role;
drop trigger if exists promotions_ends_check on public.promotions;
create trigger promotions_ends_check before insert on public.promotions for each row execute function private.promotions_ends_check();

-- Offres vues par un visiteur sans compte : avec leur créneau de validité
drop function if exists public.guest_promotions();
drop function if exists private.guest_promotions();
create function private.guest_promotions()
returns table (id uuid, merchant_id uuid, kind public.promotion_kind, title text, details text, created_at timestamptz,
               ends_at timestamptz, locked boolean, photo_path text, valid_days smallint[], valid_from time, valid_to time)
language sql stable security definer set search_path = '' as $$
  with live as (
    select p.id, p.merchant_id, p.kind, p.title, p.details, p.created_at, p.ends_at, p.photo_path, p.valid_days, p.valid_from, p.valid_to
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
    case when u.id is not null then l.photo_path end,
    l.valid_days, l.valid_from, l.valid_to
  from live l left join unlocked u on u.id = l.id
$$;
revoke all on function private.guest_promotions() from public;
grant execute on function private.guest_promotions() to anon, authenticated;
create function public.guest_promotions()
returns table (id uuid, merchant_id uuid, kind public.promotion_kind, title text, details text, created_at timestamptz,
               ends_at timestamptz, locked boolean, photo_path text, valid_days smallint[], valid_from time, valid_to time)
language sql stable set search_path = '' as $$
  select * from private.guest_promotions()
$$;
revoke all on function public.guest_promotions() from public;
grant execute on function public.guest_promotions() to anon, authenticated, service_role;
