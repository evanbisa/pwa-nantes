-- Tableau de bord de l'équipe, 2e version (/app/tableau-de-bord/) : en plus des chiffres existants,
--  1. Bugs vus sur les appareils (client_errors) : erreurs JavaScript de la carte et de l'application, et réponses en
--     erreur du serveur (5xx, fonction ou table introuvable). Aucun identifiant de personne ni d'appareil : message
--     (adresses e-mail, jetons, identifiants et paramètres d'adresse effacés par la base), page, type d'appareil,
--     navigateur, version publiée. Une ligne par bug et par jour ; effacé après 90 jours.
--  2. Suivi des bugs par l'équipe (error_triage) : « corrigé » ou « ignoré » ; un bug corrigé qui revient est signalé.
--  3. team_dashboard(jours) : ajoute les bugs, la santé du serveur (taille de la base et du stockage, tâches planifiées,
--     ménage, Whop, tentatives d'inscription), les entonnoirs clients et restaurateurs, les restaurants à relancer,
--     les avis signalés, le contenu publié, la fidélité des visiteurs, la période précédente et l'activité récente.
-- Migration additive : les chiffres existants sont gardés tels quels (team_dashboard_core), rien n'est supprimé.
begin;

-- 1. Bugs vus sur les appareils ---------------------------------------------------------------------------------
create table public.client_errors (
  day          date not null default ((now() at time zone 'Europe/Paris')::date),
  fingerprint  text not null check (fingerprint ~ '^[0-9a-f]{32}$'),   -- même bug = même empreinte (message + fichier)
  kind         text not null check (kind in ('js', 'promise', 'server')),
  app          text not null check (app in ('carte', 'app')),
  message      text not null check (char_length(message) between 1 and 300),
  source       text check (char_length(source) <= 300),
  stack        text check (char_length(stack) <= 2000),
  occurrences  integer not null default 1 check (occurrences > 0),
  signed_in    integer not null default 0,                   -- dont, avec un compte connecté
  platforms    jsonb not null default '{}'::jsonb,           -- { "ios": 3, "android": 1 }
  browsers     jsonb not null default '{}'::jsonb,           -- { "Safari 18": 3 }
  pages        jsonb not null default '{}'::jsonb,           -- { "/": 4 }
  releases     jsonb not null default '{}'::jsonb,           -- { "e485bcb": 4 } (commit publié)
  first_at     timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  primary key (day, fingerprint)
);
create index client_errors_fingerprint_idx on public.client_errors (fingerprint);
comment on table public.client_errors is 'Bugs vus sur les appareils (tableau de bord de l''équipe). Sans identifiant de personne ni d''appareil ; jamais lisible depuis le site ; effacé après 90 jours.';
revoke all on public.client_errors from anon, authenticated;
grant all on public.client_errors to service_role;
alter table public.client_errors enable row level security;
create policy "client_errors : aucun accès direct" on public.client_errors for all to anon, authenticated using (false) with check (false);

create table public.error_triage (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{32}$'),
  status      text not null check (status in ('resolved', 'ignored')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
create index error_triage_updated_by_idx on public.error_triage (updated_by);
comment on table public.error_triage is 'Bugs marqués « corrigé » ou « ignoré » par l''équipe (tableau de bord).';
revoke all on public.error_triage from anon, authenticated;
grant all on public.error_triage to service_role;
alter table public.error_triage enable row level security;
create policy "error_triage : aucun accès direct" on public.error_triage for all to anon, authenticated using (false) with check (false);

-- Texte d'erreur sans donnée personnelle : adresses e-mail, jetons, identifiants, paramètres d'adresse, longs nombres
create function private.scrub_text(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(p,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[e-mail]', 'g'),
    'eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]*)*', '[jeton]', 'g'),
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'),
    '(\?|#[^\s"''<>()]*=)[^\s"''<>()]*', '', 'g'),                -- ?paramètres et #jeton=… des adresses
    '(^|[^:0-9])[0-9][0-9 ]{5,}[0-9]', '\1[nombre]', 'g')        -- numéros de ligne (:1234) et versions (2.118.0) gardés
$$;
revoke all on function private.scrub_text(text) from public, anon, authenticated;

-- Compteur par clé (10 clés au plus, le reste dans « autre »)
create function private.bump(p_map jsonb, p_key text) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_map ? p_key or (select count(*) from jsonb_object_keys(p_map)) < 10
      then p_map || jsonb_build_object(p_key, coalesce((p_map ->> p_key)::integer, 0) + 1)
    else p_map || jsonb_build_object('autre', coalesce((p_map ->> 'autre')::integer, 0) + 1)
  end
$$;
revoke all on function private.bump(jsonb, text) from public, anon, authenticated;

create function private.report_client_error(
  p_kind text, p_app text, p_message text, p_source text default null, p_stack text default null,
  p_page text default null, p_platform text default null, p_browser text default null, p_release text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  msg text; src text; stk text; pg text; plat text; brw text; rel text; fp text;
begin
  if p_kind is null or p_kind not in ('js', 'promise', 'server') or p_app is null or p_app not in ('carte', 'app')
     or nullif(btrim(coalesce(p_message, '')), '') is null then
    return;
  end if;
  msg  := left(private.scrub_text(btrim(left(p_message, 1000))), 300);
  src  := nullif(left(private.scrub_text(btrim(left(coalesce(p_source, ''), 1000))), 300), '');
  stk  := nullif(left(private.scrub_text(left(coalesce(p_stack, ''), 4000)), 2000), '');
  pg   := coalesce(nullif(left(regexp_replace(split_part(split_part(coalesce(p_page, ''), '?', 1), '#', 1), '[^A-Za-z0-9/._-]', '', 'g'), 80), ''), '/');
  plat := case when p_platform in ('ios', 'android', 'desktop') then p_platform else 'desktop' end;
  brw  := coalesce(nullif(left(regexp_replace(coalesce(p_browser, ''), '[^A-Za-z0-9 ._-]', '', 'g'), 30), ''), 'Inconnu');
  rel  := case when p_release ~ '^[0-9a-f]{7,40}$' then left(p_release, 7) else 'inconnue' end;
  if msg = '' then return; end if;
  -- Même bug = même message (nombres ignorés) dans le même fichier, sans le numéro de ligne (il change à chaque publication)
  fp := md5(p_kind || '|' || p_app || '|' || regexp_replace(msg, '[0-9]+', '#', 'g') || '|'
            || coalesce(regexp_replace(src, '(:[0-9]+)+$', ''), ''));

  -- Premier bug du jour : ménage des bugs de plus de 90 jours
  if not exists (select 1 from public.client_errors where day = today) then
    delete from public.client_errors where day < today - 90;
  end if;
  -- Plafond anti-abus : 2 000 bugs différents par jour au plus (les bugs déjà vus restent comptés)
  if not exists (select 1 from public.client_errors where day = today and fingerprint = fp)
     and (select count(*) from public.client_errors where day = today) >= 2000 then
    return;
  end if;

  insert into public.client_errors as e (day, fingerprint, kind, app, message, source, stack, signed_in, platforms, browsers, pages, releases)
  values (today, fp, p_kind, p_app, msg, src, stk, case when (select auth.uid()) is null then 0 else 1 end,
          jsonb_build_object(plat, 1), jsonb_build_object(brw, 1), jsonb_build_object(pg, 1), jsonb_build_object(rel, 1))
  on conflict (day, fingerprint) do update set
    occurrences = least(e.occurrences + 1, 1000000),
    signed_in   = least(e.signed_in + excluded.signed_in, 1000000),
    stack       = coalesce(e.stack, excluded.stack),
    platforms   = private.bump(e.platforms, plat),
    browsers    = private.bump(e.browsers, brw),
    pages       = private.bump(e.pages, pg),
    releases    = private.bump(e.releases, rel),
    last_at     = now();
end $$;
revoke all on function private.report_client_error(text, text, text, text, text, text, text, text, text) from public;
grant execute on function private.report_client_error(text, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;

create function public.report_client_error(
  p_kind text, p_app text, p_message text, p_source text default null, p_stack text default null,
  p_page text default null, p_platform text default null, p_browser text default null, p_release text default null)
returns void language sql set search_path = '' as $$
  select private.report_client_error(p_kind, p_app, p_message, p_source, p_stack, p_page, p_platform, p_browser, p_release)
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;

-- 2. Suivi des bugs par l'équipe ----------------------------------------------------------------------------------
create function private.team_error_triage(p_fingerprint text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam' using errcode = '42501';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{32}$' then
    raise exception 'Bug inconnu' using errcode = '22023';
  end if;
  if p_status is null then
    delete from public.error_triage where fingerprint = p_fingerprint;            -- rouvert
  elsif p_status in ('resolved', 'ignored') then
    insert into public.error_triage (fingerprint, status, updated_at, updated_by)
    values (p_fingerprint, p_status, now(), (select auth.uid()))
    on conflict (fingerprint) do update set status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  else
    raise exception 'État inconnu' using errcode = '22023';
  end if;
end $$;
revoke all on function private.team_error_triage(text, text) from public, anon;
grant execute on function private.team_error_triage(text, text) to authenticated, service_role;

create function public.team_error_triage(p_fingerprint text, p_status text default null) returns void
language sql set search_path = '' as $$ select private.team_error_triage(p_fingerprint, p_status) $$;
revoke all on function public.team_error_triage(text, text) from public, anon;
grant execute on function public.team_error_triage(text, text) to authenticated, service_role;

-- 3. Chiffres du tableau de bord ----------------------------------------------------------------------------------
-- Les chiffres existants deviennent le « socle » (inchangés) ; team_dashboard y ajoute les nouveaux.
alter function private.team_dashboard(integer) rename to team_dashboard_core;
revoke all on function private.team_dashboard_core(integer) from public, anon, authenticated;

create function private.team_dashboard(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  days   integer := least(greatest(coalesce(p_days, 30), 7), 365);
  today  date := (now() at time zone 'Europe/Paris')::date;
  since  date := today - (days - 1);
  prev   date := since - days;                     -- période précédente, même durée : [prev, since[
  since_ts timestamptz := (since::timestamp at time zone 'Europe/Paris');
  prev_ts  timestamptz := (prev::timestamp at time zone 'Europe/Paris');
  out    jsonb;
  health jsonb := '{}'::jsonb;
begin
  out := private.team_dashboard_core(days);        -- refuse tout compte hors de l'équipe

  -- Santé du serveur : chaque mesure à part (une mesure indisponible n'empêche pas les autres)
  begin
    health := health || jsonb_build_object('db_bytes', pg_database_size(current_database()));
  exception when others then null; end;
  begin
    health := health || jsonb_build_object('storage', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', x.bucket_id, 'files', x.files, 'bytes', x.bytes) order by x.bytes desc), '[]'::jsonb)
      from (select o.bucket_id, count(*) as files, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
            from storage.objects o group by o.bucket_id) x));
  exception when others then null; end;
  begin
    health := health || jsonb_build_object('tables', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.bytes, 'rows', t.rows) order by t.bytes desc), '[]'::jsonb)
      from (select c.relname, pg_total_relation_size(c.oid) as bytes, greatest(c.reltuples, 0)::bigint as rows
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
            order by pg_total_relation_size(c.oid) desc limit 8) t));
  exception when others then null; end;
  begin
    health := health || jsonb_build_object('cron', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'job', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', r.status, 'last_start', r.start_time, 'last_message', left(r.return_message, 160),
        'failures_7d', (select count(*) from cron.job_run_details f where f.jobid = j.jobid and f.status = 'failed' and f.start_time > now() - interval '7 days')
      ) order by j.jobname), '[]'::jsonb)
      from cron.job j
      left join lateral (select d.status, d.start_time, d.return_message from cron.job_run_details d
                         where d.jobid = j.jobid order by d.start_time desc limit 1) r on true));
  exception when others then null; end;
  begin
    health := health || jsonb_build_object(
      'maintenance', (select coalesce(jsonb_object_agg(m.job, m.ran_at), '{}'::jsonb) from (select job, max(ran_at) as ran_at from public.maintenance_runs group by job) m),
      'whop', (select jsonb_build_object(
                 'live', coalesce((select bs.whop_live from public.billing_settings bs limit 1), false),
                 'last_event', (select max(received_at) from public.whop_events),
                 'events_30d', (select count(*) from public.whop_events))),
      'signup_attempts_24h', (select jsonb_build_object(
                 'check',  count(*) filter (where kind = 'check'),
                 'signup', count(*) filter (where kind = 'signup'))
               from public.signup_attempts where created_at > now() - interval '24 hours'),
      'users_unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
      'quota_today', jsonb_build_object(
                 'site_events', (select count(*) from public.site_events where day = today), 'site_events_max', 20000,
                 'client_errors', (select count(*) from public.client_errors where day = today), 'client_errors_max', 2000)
    );
  exception when others then null; end;

  select out || jsonb_build_object(
    'health', health,

    -- Période précédente (même durée), pour les évolutions
    'previous', jsonb_build_object(
      'visitors', (select count(distinct visitor_id) from public.site_events where event = 'visit' and day >= prev and day < since),
      'clients',  (select count(*) from public.profiles where role = 'student' and created_at >= prev_ts and created_at < since_ts),
      'merchants', (select count(*) from public.profiles where role = 'merchant' and created_at >= prev_ts and created_at < since_ts),
      'views',    (select coalesce(sum(views), 0) from public.merchant_stats where day >= prev and day < since),
      'reviews',  (select count(*) from public.reviews where created_at >= prev_ts and created_at < since_ts),
      'qr_visits', (select count(*) from public.visits where visited_at >= prev_ts and visited_at < since_ts),
      'errors',   (select coalesce(sum(occurrences), 0) from public.client_errors where day >= prev and day < since)
    ),

    -- Fidélité des visiteurs (avec accord)
    'loyalty', (
      with v as (select visitor_id, count(distinct day) as n from public.site_events where event = 'visit' and day >= since group by visitor_id)
      select jsonb_build_object(
        'returning', count(*) filter (where n >= 2),
        'avg_days',  coalesce(round(avg(n), 1), 0),
        'today',     (select count(distinct visitor_id) from public.site_events where event = 'visit' and day = today),
        'last_7',    (select count(distinct visitor_id) from public.site_events where event = 'visit' and day > today - 7),
        'last_30',   (select count(distinct visitor_id) from public.site_events where event = 'visit' and day > today - 30)
      ) from v
    ),
    'new_visitors_daily', (
      with firsts as (select visitor_id, min(day) as d from public.site_events where event = 'visit' group by visitor_id)
      select coalesce(jsonb_agg(jsonb_build_object('day', g.day::date, 'new', (select count(*) from firsts f where f.d = g.day::date)) order by g.day), '[]'::jsonb)
      from generate_series(since, today, interval '1 day') as g(day)
    ),
    'weekdays', (
      select jsonb_agg(coalesce(w.n, 0) order by g.d)
      from generate_series(1, 7) as g(d)
      left join (select extract(isodow from day)::int as d, count(*) as n from public.site_events
                 where event = 'visit' and day >= since group by 1) w on w.d = g.d
    ),
    'view_hours', (
      select jsonb_agg(coalesce(h.n, 0) order by g.h)
      from generate_series(0, 23) as g(h)
      left join (select hour::int as h, sum(views) as n from public.merchant_view_hours where day >= since group by 1) h on h.h = g.h
    ),

    -- Comptes clients : activité
    'accounts_more', (
      select jsonb_build_object(
        'total',          count(*),
        'unconfirmed',    count(*) filter (where u.email_confirmed_at is null),
        'signed_in_7d',   count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
        'signed_in_30d',  count(*) filter (where u.last_sign_in_at > now() - interval '30 days'),
        'app_installed',  count(*) filter (where u.raw_user_meta_data ? 'app_installed_at'),
        'notify_promos',  count(*) filter (where p.role = 'student' and p.notify_promos),
        'with_follow',    count(*) filter (where p.role = 'student' and exists (select 1 from public.follows f where f.user_id = p.id))
      )
      from public.profiles p join auth.users u on u.id = p.id
    ),
    'clients_funnel', (
      select jsonb_build_object(
        'new',       count(*),
        'activated', count(*) filter (where exists (select 1 from public.follows f where f.user_id = p.id)
                                        or exists (select 1 from public.reviews r where r.user_id = p.id)
                                        or exists (select 1 from public.visits vi where vi.user_id = p.id)
                                        or exists (select 1 from public.dish_likes dl where dl.user_id = p.id)
                                        or exists (select 1 from public.story_likes sl where sl.user_id = p.id)),
        'qr_visit',  count(*) filter (where exists (select 1 from public.visits vi where vi.user_id = p.id))
      )
      from public.profiles p where p.role = 'student' and p.created_at >= since_ts
    ),

    -- Restaurateurs : de l'inscription à la carte
    'merchant_funnel', (
      select jsonb_build_object(
        'accounts',   (select count(*) from public.profiles where role = 'merchant'),
        'fiche',      count(*),
        'siret',      count(*) filter (where mp.siret_verified_at is not null),
        'docs',       count(*) filter (where private.merchant_docs_ok(m.id)),
        'subscribed', count(*) filter (where s.status in ('active', 'past_due')),
        'published',  count(*) filter (where m.status = 'published'),
        'suspended',  count(*) filter (where m.status = 'suspended')
      )
      from public.merchants m
      left join public.merchant_private mp on mp.merchant_id = m.id
      left join public.merchant_subscriptions s on s.merchant_id = m.id
      where not m.is_test
    ),
    -- À relancer : comptes restaurateurs pas encore sur la carte (le plus ancien d'abord)
    'merchants_pending', (
      select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb)
      from (
        select coalesce(m.name, '(fiche pas encore créée)') as name, coalesce(m.status::text, 'no_fiche') as status,
               coalesce(m.created_at, p.created_at) as created_at, u.email,
               mp.siret_verified_at is not null as siret, coalesce(private.merchant_docs_ok(m.id), false) as docs,
               s.status as subscription, m.honor_at is not null as honor
        from public.profiles p
        join auth.users u on u.id = p.id
        left join public.merchants m on m.user_id = p.id
        left join public.merchant_private mp on mp.merchant_id = m.id
        left join public.merchant_subscriptions s on s.merchant_id = m.id
        where p.role = 'merchant' and coalesce(m.status::text, 'no_fiche') <> 'published' and not coalesce(m.is_test, false)
        order by coalesce(m.created_at, p.created_at)
        limit 30
      ) x
    ),
    'subscriptions_more', (
      select jsonb_build_object(
        'past_due',   count(*) filter (where s.status = 'past_due'),
        'cancelling', count(*) filter (where s.status in ('active', 'past_due') and s.cancel_at_period_end),
        'renew_7d',   count(*) filter (where s.status in ('active', 'past_due') and s.current_period_end between now() and now() + interval '7 days'),
        'plans',      coalesce((select jsonb_object_agg(k, n) from (
                        select coalesce(s2.plan, '?') || ' · ' || case s2.period when 'year' then 'an' when 'month' then 'mois' else coalesce(s2.period, '?') end as k, count(*) as n
                        from public.merchant_subscriptions s2 where s2.status in ('active', 'past_due') group by 1) z), '{}'::jsonb)
      )
      from public.merchant_subscriptions s
    ),

    -- Contenu publié et utilisation
    'content', jsonb_build_object(
      'promos_active',  (select count(*) from public.promotions where ends_at > now()),
      'promos_period',  (select count(*) from public.promotions where created_at >= since_ts),
      'stories_active', (select count(*) from public.stories where expires_at > now()),
      'stories_period', (select count(*) from public.stories where created_at >= since_ts),
      'menu_scans',     (select count(*) from public.menu_scans where created_at >= since_ts),
      'reviews_period', (select count(*) from public.reviews where created_at >= since_ts),
      'rating_period',  (select round(avg(rating)::numeric, 2) from public.reviews where created_at >= since_ts),
      'replied_period', (select count(*) from public.reviews where created_at >= since_ts and reply is not null),
      'follows_period', (select count(*) from public.follows where created_at >= since_ts),
      'likes_period',   (select count(*) from public.dish_likes where created_at >= since_ts)
                        + (select count(*) from public.story_likes where created_at >= since_ts),
      'notifs_period',  (select count(*) from public.notifications where created_at >= since_ts),
      'pushed_period',  (select count(*) from public.notifications where created_at >= since_ts and pushed_at is not null),
      'qr_visits',      (select count(*) from public.visits where visited_at >= since_ts),
      'qr_with_promo',  (select count(*) from public.visits where visited_at >= since_ts and promo_title is not null)
    ),

    -- Modération : avis signalés (les plus récents d'abord)
    'reported_reviews', (
      select coalesce(jsonb_agg(r order by r.reported_at desc), '[]'::jsonb)
      from (
        select rv.id, m.name as merchant, rv.rating, left(rv.comment, 280) as comment, rv.author_name, rv.created_at, rv.reported_at
        from public.reviews rv join public.merchants m on m.id = rv.merchant_id
        where rv.reported_at is not null
        order by rv.reported_at desc limit 20
      ) r
    ),

    -- Bugs
    'errors', (
      select jsonb_build_object(
        'occurrences', coalesce(sum(e.occurrences), 0),
        'server',      coalesce(sum(e.occurrences) filter (where e.kind = 'server'), 0),
        'distinct',    count(distinct e.fingerprint),
        'new_24h',     (select count(*) from (select fingerprint from public.client_errors group by fingerprint having min(first_at) > now() - interval '24 hours') n),
        'today',       coalesce(sum(e.occurrences) filter (where e.day = today), 0)
      ) from public.client_errors e where e.day >= since
    ),
    'errors_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', g.day::date, 'js', coalesce(d.js, 0), 'server', coalesce(d.server, 0)) order by g.day), '[]'::jsonb)
      from generate_series(since, today, interval '1 day') as g(day)
      left join (select day, sum(occurrences) filter (where kind <> 'server') as js, sum(occurrences) filter (where kind = 'server') as server
                 from public.client_errors where day >= since group by day) d on d.day = g.day::date
    ),
    'error_list', (
      select coalesce(jsonb_agg(b order by b.open desc, b.last_at desc), '[]'::jsonb)
      from (
        select a.fingerprint, a.kind, a.app, a.message, a.source, a.stack, a.occurrences, a.signed_in, a.days_seen, a.last_at,
               (select min(f.first_at) from public.client_errors f where f.fingerprint = a.fingerprint) as first_at,
               t.status, t.updated_at as triaged_at,
               (t.status is null or (t.status = 'resolved' and a.last_at > t.updated_at)) as open,
               (t.status = 'resolved' and a.last_at > t.updated_at) as reappeared,
               (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select x.key as k, sum(x.value::int) as n from public.client_errors e2, jsonb_each_text(e2.platforms) x
                  where e2.fingerprint = a.fingerprint and e2.day >= since group by x.key order by n desc limit 5) z) as platforms,
               (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select x.key as k, sum(x.value::int) as n from public.client_errors e2, jsonb_each_text(e2.browsers) x
                  where e2.fingerprint = a.fingerprint and e2.day >= since group by x.key order by n desc limit 5) z) as browsers,
               (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select x.key as k, sum(x.value::int) as n from public.client_errors e2, jsonb_each_text(e2.pages) x
                  where e2.fingerprint = a.fingerprint and e2.day >= since group by x.key order by n desc limit 5) z) as pages,
               (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select x.key as k, sum(x.value::int) as n from public.client_errors e2, jsonb_each_text(e2.releases) x
                  where e2.fingerprint = a.fingerprint and e2.day >= since group by x.key order by n desc limit 5) z) as releases,
               (select jsonb_agg(coalesce((select e3.occurrences from public.client_errors e3 where e3.fingerprint = a.fingerprint and e3.day = g.d::date), 0) order by g.d)
                  from generate_series(today - 13, today, interval '1 day') as g(d)) as spark
        from (
          select e.fingerprint, min(e.kind) as kind, min(e.app) as app,
                 (array_agg(e.message order by e.last_at desc))[1] as message,
                 (array_agg(e.source order by e.last_at desc))[1] as source,
                 (array_agg(e.stack order by e.last_at desc) filter (where e.stack is not null))[1] as stack,
                 sum(e.occurrences) as occurrences, sum(e.signed_in) as signed_in, count(*) as days_seen, max(e.last_at) as last_at
          from public.client_errors e where e.day >= since group by e.fingerprint
        ) a
        left join public.error_triage t on t.fingerprint = a.fingerprint
        order by (t.status is null or (t.status = 'resolved' and a.last_at > t.updated_at)) desc, a.last_at desc
        limit 60
      ) b
    ),

    -- Activité récente (30 derniers jours)
    'activity', (
      select coalesce(jsonb_agg(a order by a.at desc), '[]'::jsonb)
      from (
        (select p.created_at as at, case p.role when 'merchant' then 'merchant_signup' else 'client_signup' end as type, null::text as label, null::text as detail
           from public.profiles p where p.created_at > now() - interval '30 days' order by p.created_at desc limit 25)
        union all
        (select m.published_at, 'published', m.name, null from public.merchants m
           where m.published_at > now() - interval '30 days' and not m.is_test order by m.published_at desc limit 25)
        union all
        (select rv.created_at, 'review', m.name, rv.rating::text from public.reviews rv join public.merchants m on m.id = rv.merchant_id
           where rv.created_at > now() - interval '30 days' order by rv.created_at desc limit 25)
        union all
        (select pr.created_at, 'promo', m.name, pr.title from public.promotions pr join public.merchants m on m.id = pr.merchant_id
           where pr.created_at > now() - interval '30 days' order by pr.created_at desc limit 25)
        union all
        (select st.created_at, 'story', m.name, null from public.stories st join public.merchants m on m.id = st.merchant_id
           where st.created_at > now() - interval '30 days' order by st.created_at desc limit 25)
        union all
        (select vi.visited_at, 'qr_visit', m.name, vi.promo_title from public.visits vi join public.merchants m on m.id = vi.merchant_id
           where vi.visited_at > now() - interval '30 days' order by vi.visited_at desc limit 25)
        union all
        (select s.started_at, 'subscription', m.name, s.plan from public.merchant_subscriptions s join public.merchants m on m.id = s.merchant_id
           where s.started_at > now() - interval '30 days' and s.mode <> 'demo' order by s.started_at desc limit 25)
        union all
        (select f.first_at, 'new_bug', null, f.message from (
           select fingerprint, min(first_at) as first_at, (array_agg(message order by first_at))[1] as message
           from public.client_errors group by fingerprint having min(first_at) > now() - interval '30 days') f
           order by f.first_at desc limit 25)
        order by at desc
        limit 40
      ) a
    )
  ) into out;
  return out;
end $$;
revoke all on function private.team_dashboard(integer) from public, anon;
grant execute on function private.team_dashboard(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
