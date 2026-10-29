-- Tableau de bord de l'équipe FlashMiam (/app/tableau-de-bord/) :
--  1. Membres de l'équipe (team_admins) : seuls comptes autorisés à voir les totaux de toute la plateforme.
--  2. Visites du site et écran d'accueil (site_events) : une ligne par appareil, jour et type, avec l'accord
--     « statistiques » seulement ; identifiant d'appareil tiré au hasard (jamais le compte). Effacées après 13 mois
--     par la fonction serveur « purge ».
--  3. team_dashboard(jours) : tous les chiffres du tableau de bord, en une fois, pour l'équipe uniquement.
-- Migration additive : aucune table ni donnée existante modifiée.

-- 1. Équipe ------------------------------------------------------------------------------------------------------
create table public.team_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
comment on table public.team_admins is 'Comptes de l''équipe FlashMiam (tableau de bord). Ajout à la main (SQL) ; jamais lisible depuis le site.';
revoke all on public.team_admins from anon, authenticated;
grant all on public.team_admins to service_role;
alter table public.team_admins enable row level security;
create policy "team_admins : aucun accès direct" on public.team_admins for all to anon, authenticated using (false) with check (false);

create function public.is_team_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_team_admin() from public, anon;
grant execute on function public.is_team_admin() to authenticated;

-- 2. Visites du site ---------------------------------------------------------------------------------------------
create table public.site_events (
  day        date not null default ((now() at time zone 'Europe/Paris')::date),
  event      text not null check (event in ('visit', 'install_shown', 'install_accepted', 'installed')),
  visitor_id uuid not null,                       -- tiré au hasard sur l'appareil, sans lien avec le compte
  platform   text not null check (platform in ('ios', 'android', 'desktop')),
  standalone boolean not null default false,      -- ouvert depuis l'icône de l'écran d'accueil
  signed_in  boolean not null default false,
  primary key (day, event, visitor_id)
);
comment on table public.site_events is 'Visites du site et proposition « écran d''accueil » (accord statistiques). Une ligne par appareil, jour et type ; jamais lisible ; effacé après 13 mois.';
revoke all on public.site_events from anon, authenticated;
grant all on public.site_events to service_role;
alter table public.site_events enable row level security;
create policy "site_events : aucun accès direct" on public.site_events for all to anon, authenticated using (false) with check (false);

create function public.track_site_event(p_event text, p_visitor uuid, p_platform text, p_standalone boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  if p_visitor is null or p_event not in ('visit', 'install_shown', 'install_accepted', 'installed')
     or p_platform not in ('ios', 'android', 'desktop') then
    return;
  end if;
  -- Plafond anti-abus : au-delà de 20 000 lignes par jour, plus rien n'est compté (le site ne casse pas)
  if (select count(*) from public.site_events where day = today) >= 20000 then
    return;
  end if;
  insert into public.site_events (day, event, visitor_id, platform, standalone, signed_in)
  values (today, p_event, p_visitor, p_platform, coalesce(p_standalone, false), (select auth.uid()) is not null)
  on conflict (day, event, visitor_id) do update
    set standalone = public.site_events.standalone or excluded.standalone,
        signed_in  = public.site_events.signed_in or excluded.signed_in;
end $$;
revoke all on function public.track_site_event(text, uuid, text, boolean) from public;
grant execute on function public.track_site_event(text, uuid, text, boolean) to anon, authenticated;

-- 3. Chiffres du tableau de bord -----------------------------------------------------------------------------------
create function public.team_dashboard(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  days  integer := least(greatest(coalesce(p_days, 30), 7), 365);
  today date := (now() at time zone 'Europe/Paris')::date;
  since date := today - (days - 1);
  out   jsonb;
begin
  if not public.is_team_admin() then
    raise exception 'Tableau de bord réservé à l''équipe FlashMiam' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'days', days,
    'since', since,

    -- Comptes
    'accounts', (
      select jsonb_build_object(
        'clients',       count(*) filter (where p.role = 'student'),
        'merchants',     count(*) filter (where p.role = 'merchant'),
        'new_period',    count(*) filter (where p.role = 'student' and (p.created_at at time zone 'Europe/Paris')::date >= since),
        'new_7d',        count(*) filter (where p.role = 'student' and (p.created_at at time zone 'Europe/Paris')::date >= today - 6),
        'google',        count(*) filter (where p.role = 'student' and coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'),
        'push_devices',  (select count(distinct s.user_id) from public.push_subscriptions s)
      )
      from public.profiles p join auth.users u on u.id = p.id
    ),
    'signups_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'clients', d.clients, 'merchants', d.merchants) order by d.day), '[]'::jsonb)
      from (
        select g.day::date as day,
               count(p.id) filter (where p.role = 'student')  as clients,
               count(p.id) filter (where p.role = 'merchant') as merchants
        from generate_series(since, today, interval '1 day') as g(day)
        left join public.profiles p on (p.created_at at time zone 'Europe/Paris')::date = g.day::date
        group by g.day
      ) d
    ),

    -- Fréquentation du site (avec accord)
    'visits_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'app', d.app) order by d.day), '[]'::jsonb)
      from (
        select g.day::date as day,
               count(e.visitor_id) as visitors,
               count(e.visitor_id) filter (where e.standalone) as app
        from generate_series(since, today, interval '1 day') as g(day)
        left join public.site_events e on e.day = g.day::date and e.event = 'visit'
        group by g.day
      ) d
    ),
    'visits', (
      select jsonb_build_object(
        'visitors', count(distinct visitor_id),
        'visits',   count(*),
        'signed_in', count(distinct visitor_id) filter (where signed_in),
        'app',      count(distinct visitor_id) filter (where standalone),
        'ios',      count(distinct visitor_id) filter (where platform = 'ios'),
        'android',  count(distinct visitor_id) filter (where platform = 'android'),
        'desktop',  count(distinct visitor_id) filter (where platform = 'desktop')
      )
      from public.site_events where event = 'visit' and day >= since
    ),
    'install', (
      select jsonb_build_object(
        'shown',     count(distinct visitor_id) filter (where event = 'install_shown'),
        'accepted',  count(distinct visitor_id) filter (where event = 'install_accepted'),
        'installed', count(distinct visitor_id) filter (where event = 'installed')
      )
      from public.site_events where day >= since
    ),

    -- Restaurants et abonnements
    'restaurants', (
      select jsonb_build_object(
        'published', count(*) filter (where m.status = 'published' and not m.is_test),
        'other',     count(*) filter (where m.status <> 'published' and not m.is_test),
        'test',      count(*) filter (where m.is_test)
      )
      from public.merchants m
    ),
    'subscriptions', (
      select jsonb_build_object(
        'active',  count(*) filter (where s.status in ('active', 'past_due')),
        'paid',    count(*) filter (where s.status in ('active', 'past_due') and s.mode in ('whop', 'stripe', 'manual')),
        'demo',    count(*) filter (where s.status in ('active', 'past_due') and s.mode = 'demo'),
        -- Revenu mensuel récurrent (HT) des abonnements payés par Whop : formule à l'année ramenée au mois
        'mrr_cents', coalesce(sum(case when s.status in ('active', 'past_due') and s.mode = 'whop'
                                       then case when bp.period = 'year' then bp.price_cents / 12 else bp.price_cents end end), 0)
      )
      from public.merchant_subscriptions s
      left join public.billing_plans bp on bp.tier = s.plan and bp.period = s.period
    ),

    -- Utilisation des fiches
    'engagement', (
      select jsonb_build_object(
        'views',       coalesce(sum(st.views), 0),
        'directions',  coalesce(sum(st.walk_clicks + st.car_clicks), 0),
        'calls',       coalesce(sum(st.phone_clicks), 0),
        'menus',       coalesce(sum(st.menu_views), 0),
        'stories',     coalesce(sum(st.story_views), 0),
        'follows',     (select count(*) from public.follows),
        'reviews',     (select count(*) from public.reviews),
        'rating',      (select round(avg(rating)::numeric, 2) from public.reviews),
        'promo_clicks', (select count(*) from public.promo_clicks where clicked_at >= since)
      )
      from public.merchant_stats st where st.day >= since
    ),
    'top_merchants', (
      select coalesce(jsonb_agg(t order by t.views desc, t.name), '[]'::jsonb)
      from (
        select m.name, m.is_test,
               coalesce((select sum(st.views) from public.merchant_stats st where st.merchant_id = m.id and st.day >= since), 0) as views,
               (select count(*) from public.follows f where f.merchant_id = m.id) as followers
        from public.merchants m
        where m.status = 'published'
        order by views desc, m.name
        limit 8
      ) t
    ),

    -- Clients : sexe et âge (réponses facultatives)
    'audience', (
      select jsonb_build_object(
        'female',  count(*) filter (where gender = 'female'),
        'male',    count(*) filter (where gender = 'male'),
        'other',   count(*) filter (where gender = 'other'),
        'unknown', count(*) filter (where gender is null),
        'ages', jsonb_build_object(
          '15-17', count(*) filter (where birth_year is not null and extract(year from today) - birth_year < 18),
          '18-24', count(*) filter (where extract(year from today) - birth_year between 18 and 24),
          '25-34', count(*) filter (where extract(year from today) - birth_year between 25 and 34),
          '35+',   count(*) filter (where extract(year from today) - birth_year >= 35),
          'unknown', count(*) filter (where birth_year is null)
        )
      )
      from public.profiles where role = 'student'
    )
  ) into out;
  return out;
end $$;
revoke all on function public.team_dashboard(integer) from public, anon;
grant execute on function public.team_dashboard(integer) to authenticated;
