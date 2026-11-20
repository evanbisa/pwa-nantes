-- Public plus large (19 novembre 2026) : nouveaux types de promotions et titres-restaurant.
--  - promotion_kind : « Formule midi » (lunch), « Afterwork / happy hour » (afterwork), « Week-end / brunch » (weekend).
--    Week-end : retirée automatiquement le dimanche soir, comme la promo de la semaine ; les deux autres restent
--    jusqu'à ce que le restaurateur les retire (ou leur date de fin, un an au plus).
--  - merchants.accepts_meal_vouchers : le restaurant accepte les titres-restaurant (papier ou carte) ; filtre de la carte.
alter type public.promotion_kind add value if not exists 'lunch';
alter type public.promotion_kind add value if not exists 'afterwork';
alter type public.promotion_kind add value if not exists 'weekend';

create or replace function private.promotions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if new.kind = 'day' then
    new.ends_at := ((v_today + 1)::timestamp at time zone 'Europe/Paris');
  elsif new.kind::text in ('week', 'weekend') then
    new.ends_at := ((v_today + 1 + (7 - extract(isodow from v_today)::int))::timestamp at time zone 'Europe/Paris');
  elsif new.ends_at is not null and new.ends_at > now() + interval '366 days' then
    raise exception 'Une promotion dure un an au plus.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.promotions p where p.merchant_id = new.merchant_id and (p.ends_at is null or p.ends_at > now())) >= 6 then
    raise exception 'Six promotions en cours au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Notification aux abonnés : libellé des nouveaux types
create or replace function private.notify_promotion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, merchant_id, kind, title, body, ref_id)
  select f.user_id, new.merchant_id, 'promo', left(m.name, 120),
         left(case new.kind::text when 'day' then 'Promo du jour' when 'week' then 'Promo de la semaine'
                            when 'student' then 'Offre étudiante' when 'lunch' then 'Formule midi'
                            when 'afterwork' then 'Afterwork' when 'weekend' then 'Ce week-end' else 'Bon plan' end || ' : ' || new.title, 200),
         new.id
  from public.follows f
  join public.merchants m on m.id = f.merchant_id
  join public.profiles p on p.id = f.user_id
  where f.merchant_id = new.merchant_id and m.status = 'published' and m.is_open and p.notify_promos
    and (new.ends_at is null or new.ends_at > now())
    and (select count(*) from public.notifications n where n.user_id = f.user_id and n.merchant_id = new.merchant_id
         and n.kind = 'promo' and n.created_at > now() - interval '24 hours') < 10;
  perform private.purge_notifications();
  return null;
end;
$$;

alter table public.merchants add column if not exists accepts_meal_vouchers boolean not null default false;
comment on column public.merchants.accepts_meal_vouchers is 'Le restaurant accepte les titres-restaurant (papier ou carte) : filtre « Titres-resto » de la carte.';
grant update (accepts_meal_vouchers) on public.merchants to authenticated;
