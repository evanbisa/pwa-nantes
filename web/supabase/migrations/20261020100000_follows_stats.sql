-- =============================================================================
-- Abonnements (« Suivre » un restaurant) et statistiques de fréquentation
--
-- Confidentialité :
--   * un étudiant voit et gère uniquement ses propres abonnements ;
--   * un restaurateur ne voit que des CHIFFRES (nombre d'abonnés, de vues, de personnes…),
--     jamais l'identité de ceux qui le suivent ou le consultent ;
--   * les compteurs ne sont modifiables par personne en direct : uniquement via track_merchant_event().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Abonnements
-- -----------------------------------------------------------------------------
create table public.follows (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, merchant_id)
);
create index follows_merchant_idx on public.follows (merchant_id, created_at);
comment on table public.follows is 'Restaurants suivis. Chacun ne voit que les siens ; les restaurateurs ne voient que des totaux.';

-- On ne suit qu'un commerce en ligne, et pas le sien
create function private.can_follow(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id and m.status = 'published' and m.is_open and m.user_id <> (select auth.uid())
  )
$$;
revoke execute on function private.can_follow(uuid) from public, anon;
grant execute on function private.can_follow(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Statistiques : compteurs par commerce et par jour, et visiteurs uniques (comptes connectés)
-- -----------------------------------------------------------------------------
create table public.merchant_stats (
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  day          date not null default ((now() at time zone 'Europe/Paris')::date),
  views        integer not null default 0 check (views >= 0),
  walk_clicks  integer not null default 0 check (walk_clicks >= 0),
  car_clicks   integer not null default 0 check (car_clicks >= 0),
  phone_clicks integer not null default 0 check (phone_clicks >= 0),
  menu_views   integer not null default 0 check (menu_views >= 0),
  photo_views  integer not null default 0 check (photo_views >= 0),
  primary key (merchant_id, day)
);

-- Qui a vu quelle fiche quel jour : sert uniquement à compter des personnes, jamais lisible par un client
create table public.merchant_visitors (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  day         date not null,
  visitor_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (merchant_id, day, visitor_id)
);

-- -----------------------------------------------------------------------------
-- 3. Fonctions
--    Logique dans le schéma « private » (non exposé par l'API, droits élevés),
--    appelée par de simples relais dans « public » (sans droits particuliers).
-- -----------------------------------------------------------------------------
grant usage on schema private to anon;   -- pour les deux fonctions ouvertes aux visiteurs (rien d'autre n'y est accordé)

-- Enregistre un évènement sur une fiche en ligne (y compris sans compte).
-- Les visites du restaurateur sur sa propre fiche ne sont pas comptées.
create function private.track_merchant_event(p_merchant_id uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Europe/Paris')::date;
  v_uid uuid := (select auth.uid());
begin
  if p_event not in ('view', 'walk', 'car', 'phone', 'menu', 'photos') then
    raise exception 'Évènement inconnu : %', p_event using errcode = '22023';
  end if;
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open
                 and m.user_id is distinct from v_uid) then
    return;
  end if;
  insert into public.merchant_stats as s (merchant_id, day, views, walk_clicks, car_clicks, phone_clicks, menu_views, photo_views)
  values (p_merchant_id, v_day, (p_event = 'view')::int, (p_event = 'walk')::int, (p_event = 'car')::int,
          (p_event = 'phone')::int, (p_event = 'menu')::int, (p_event = 'photos')::int)
  on conflict (merchant_id, day) do update set
    views = s.views + excluded.views,
    walk_clicks = s.walk_clicks + excluded.walk_clicks,
    car_clicks = s.car_clicks + excluded.car_clicks,
    phone_clicks = s.phone_clicks + excluded.phone_clicks,
    menu_views = s.menu_views + excluded.menu_views,
    photo_views = s.photo_views + excluded.photo_views;
  if p_event = 'view' and v_uid is not null then
    insert into public.merchant_visitors (merchant_id, day, visitor_id) values (p_merchant_id, v_day, v_uid)
    on conflict do nothing;
  end if;
end;
$$;

-- Nombre d'abonnés d'une fiche en ligne (affiché publiquement sur la fiche)
create function private.merchant_follower_count(p_merchant_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.follows f
  join public.merchants m on m.id = f.merchant_id
  where f.merchant_id = p_merchant_id and m.status = 'published' and m.is_open
$$;

-- Tableau de bord du restaurateur connecté : chiffres jour par jour sur les p_days derniers jours (90 au plus)
create function private.my_merchant_stats(p_days integer)
returns table (day date, views integer, visitors integer, walk_clicks integer, car_clicks integer,
               phone_clicks integer, menu_views integer, photo_views integer, new_followers integer)
language sql stable security definer set search_path = '' as $$
  with me as (select m.id from public.merchants m where m.user_id = (select auth.uid())),
  days as (
    select generate_series((now() at time zone 'Europe/Paris')::date - (least(greatest(p_days, 1), 90) - 1),
                           (now() at time zone 'Europe/Paris')::date, interval '1 day')::date as day
  )
  select d.day,
         coalesce(s.views, 0), (select count(*)::int from public.merchant_visitors v where v.merchant_id = me.id and v.day = d.day),
         coalesce(s.walk_clicks, 0), coalesce(s.car_clicks, 0), coalesce(s.phone_clicks, 0),
         coalesce(s.menu_views, 0), coalesce(s.photo_views, 0),
         (select count(*)::int from public.follows f where f.merchant_id = me.id and (f.created_at at time zone 'Europe/Paris')::date = d.day)
  from me cross join days d
  left join public.merchant_stats s on s.merchant_id = me.id and s.day = d.day
  order by d.day
$$;

-- Totaux du restaurateur connecté : abonnés, et personnes distinctes sur la période
create function private.my_merchant_totals(p_days integer)
returns table (followers integer, visitors integer)
language sql stable security definer set search_path = '' as $$
  with me as (select m.id from public.merchants m where m.user_id = (select auth.uid()))
  select (select count(*)::int from public.follows f where f.merchant_id = me.id),
         (select count(distinct v.visitor_id)::int from public.merchant_visitors v
           where v.merchant_id = me.id and v.day > (now() at time zone 'Europe/Paris')::date - least(greatest(p_days, 1), 90))
  from me
$$;

-- Relais publics (appelables via l'API : /rest/v1/rpc/…)
create function public.track_merchant_event(p_merchant_id uuid, p_event text)
returns void language sql security invoker set search_path = '' as $$ select private.track_merchant_event(p_merchant_id, p_event) $$;
create function public.merchant_follower_count(p_merchant_id uuid)
returns integer language sql stable security invoker set search_path = '' as $$ select private.merchant_follower_count(p_merchant_id) $$;
create function public.my_merchant_stats(p_days integer default 7)
returns table (day date, views integer, visitors integer, walk_clicks integer, car_clicks integer,
               phone_clicks integer, menu_views integer, photo_views integer, new_followers integer)
language sql stable security invoker set search_path = '' as $$ select * from private.my_merchant_stats(p_days) $$;
create function public.my_merchant_totals(p_days integer default 7)
returns table (followers integer, visitors integer)
language sql stable security invoker set search_path = '' as $$ select * from private.my_merchant_totals(p_days) $$;

-- -----------------------------------------------------------------------------
-- 4. Privilèges et RLS
-- -----------------------------------------------------------------------------
revoke all on public.follows, public.merchant_stats, public.merchant_visitors from anon, authenticated;
grant all on public.follows, public.merchant_stats, public.merchant_visitors to service_role;
grant select, delete on public.follows to authenticated;
grant insert (merchant_id) on public.follows to authenticated;
grant select on public.merchant_stats to authenticated;

revoke execute on function private.track_merchant_event(uuid, text), private.merchant_follower_count(uuid),
  private.my_merchant_stats(integer), private.my_merchant_totals(integer),
  public.track_merchant_event(uuid, text), public.merchant_follower_count(uuid),
  public.my_merchant_stats(integer), public.my_merchant_totals(integer) from public;
grant execute on function private.track_merchant_event(uuid, text), private.merchant_follower_count(uuid),
  public.track_merchant_event(uuid, text), public.merchant_follower_count(uuid) to anon, authenticated;
grant execute on function private.my_merchant_stats(integer), private.my_merchant_totals(integer),
  public.my_merchant_stats(integer), public.my_merchant_totals(integer) to authenticated;

alter table public.follows           enable row level security;
alter table public.merchant_stats    enable row level security;
alter table public.merchant_visitors enable row level security;

create policy "follows : lecture de ses abonnements" on public.follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy "follows : s'abonner à un commerce en ligne" on public.follows
  for insert to authenticated with check (user_id = (select auth.uid()) and private.can_follow(merchant_id));
create policy "follows : se désabonner" on public.follows
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "merchant_stats : lecture par le propriétaire" on public.merchant_stats
  for select to authenticated using (private.is_merchant_owner(merchant_id));
-- merchant_visitors : aucune politique → personne ne peut le lire ni l'écrire en direct (seules les fonctions y accèdent)
