-- Horaires par jour et fermetures exceptionnelles (audit du 25 novembre 2026).
--
-- 1. opening_hours accepte une clé facultative « days » : les créneaux de chaque jour,
--    { "0": [["11:30","14:30"]], "1": [], … } (0 = dimanche … 6 = samedi ; liste vide = fermé ce jour-là).
--    « services » et « closed_on » restent remplis (résumé : créneaux du premier jour ouvert, jours sans créneau) pour
--    les anciennes versions du site et le tableau de bord de l'équipe. Jusqu'à 3 créneaux par jour.
-- 2. Fermeture exceptionnelle (congés, travaux, fermé aujourd'hui) : du closed_from au closed_until inclus (dates
--    à Paris), avec une courte note. La fiche reste visible sur la carte avec « Fermé jusqu'au … ».

create or replace function public.is_valid_hours(hours jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(hours) = 'object'
     and jsonb_typeof(hours -> 'services') = 'array'
     and jsonb_array_length(hours -> 'services') <= 3
     and not exists (
       select 1 from jsonb_array_elements(hours -> 'services') as s
       where jsonb_typeof(s) <> 'array' or jsonb_array_length(s) <> 2
          or (s ->> 0) !~ '^([01]\d|2[0-3]):[0-5]\d$' or (s ->> 1) !~ '^([01]\d|2[0-3]):[0-5]\d$'
     )
     and jsonb_typeof(coalesce(hours -> 'closed_on', '[]')) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(hours -> 'closed_on', '[]')) as d
       where jsonb_typeof(d) <> 'number' or d::int not between 0 and 6
     )
     -- Créneaux par jour (facultatif)
     and (hours -> 'days' is null or (
       jsonb_typeof(hours -> 'days') = 'object'
       and not exists (select 1 from jsonb_object_keys(hours -> 'days') as k where k !~ '^[0-6]$')
       and not exists (
         select 1 from jsonb_each(hours -> 'days') as d(k, v)
         where jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 3
            or exists (
              select 1 from jsonb_array_elements(v) as s
              where jsonb_typeof(s) <> 'array' or jsonb_array_length(s) <> 2
                 or (s ->> 0) !~ '^([01]\d|2[0-3]):[0-5]\d$' or (s ->> 1) !~ '^([01]\d|2[0-3]):[0-5]\d$'
                 or (s ->> 0) = (s ->> 1)
            )
       )
     ))
$$;

alter table public.merchants
  add column if not exists closed_from date,
  add column if not exists closed_until date,
  add column if not exists closure_note text;

alter table public.merchants
  add constraint merchants_closure_dates_check
    check ((closed_from is null) = (closed_until is null)
           and (closed_from is null or (closed_from <= closed_until and closed_until - closed_from <= 366))),
  add constraint merchants_closure_note_check
    check (closure_note is null or char_length(closure_note) <= 80);

-- Lisibles comme le reste de la fiche ; modifiables par le restaurateur (les règles d'accès limitent à sa fiche)
grant select (closed_from, closed_until, closure_note) on public.merchants to anon, authenticated;
grant update (closed_from, closed_until, closure_note) on public.merchants to authenticated;

-- Une note vide devient null, et elle disparaît avec la fermeture
create or replace function private.merchants_closure_tidy()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.closure_note := nullif(btrim(new.closure_note), '');
  if new.closed_from is null then new.closure_note := null; end if;
  return new;
end;
$$;
revoke all on function private.merchants_closure_tidy() from public;
grant execute on function private.merchants_closure_tidy() to anon, authenticated, service_role;
drop trigger if exists merchants_closure_tidy on public.merchants;
create trigger merchants_closure_tidy before insert or update of closed_from, closed_until, closure_note on public.merchants
  for each row execute function private.merchants_closure_tidy();
