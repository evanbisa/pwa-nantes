-- Offres : le restaurateur peut modifier ou prolonger une offre (audit du 25 novembre 2026).
-- « Republier » une offre terminée crée une nouvelle offre (les abonnés sont prévenus, les clics repartent de zéro).

create policy "promotions : le restaurateur modifie les siennes" on public.promotions for update to authenticated
  using (private.is_merchant_owner(merchant_id)) with check (private.is_merchant_owner(merchant_id));

grant update (kind, title, details, ends_at, photo_path, valid_days, valid_from, valid_to) on public.promotions to authenticated;

-- Contrôles d'une modification : fin à venir (un an au plus), fin automatique des offres du jour et de la semaine,
-- six offres en cours au plus si une offre terminée est relancée ; fiche et date de création jamais changées.
create or replace function private.promotions_update_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  new.merchant_id := old.merchant_id;
  new.created_at := old.created_at;
  if new.ends_at is not null and new.ends_at is distinct from old.ends_at then
    if new.ends_at <= now() then
      raise exception 'Choisissez une date de fin à venir.' using errcode = 'check_violation';
    end if;
    if new.ends_at > now() + interval '366 days' then
      raise exception 'Une promotion dure un an au plus.' using errcode = 'check_violation';
    end if;
  elsif new.ends_at is null and new.kind = 'day' then
    new.ends_at := ((v_today + 1)::timestamp at time zone 'Europe/Paris');
  elsif new.ends_at is null and new.kind::text in ('week', 'weekend') then
    new.ends_at := ((v_today + 1 + (7 - extract(isodow from v_today)::int))::timestamp at time zone 'Europe/Paris');
  end if;
  if old.ends_at is not null and old.ends_at <= now() and (new.ends_at is null or new.ends_at > now())
     and (select count(*) from public.promotions p where p.merchant_id = new.merchant_id and p.id <> new.id
          and (p.ends_at is null or p.ends_at > now())) >= 6 then
    raise exception 'Six promotions en cours au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.promotions_update_guard() from public;
drop trigger if exists promotions_update_guard on public.promotions;
create trigger promotions_update_guard before update on public.promotions
  for each row execute function private.promotions_update_guard();
