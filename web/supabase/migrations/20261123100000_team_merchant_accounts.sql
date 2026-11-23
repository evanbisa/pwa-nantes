-- Tableau de bord de l'équipe : détail des restaurateurs inscrits.
--  - merchant_accounts : chaque compte restaurateur (le plus récent d'abord) avec son e-mail, le responsable, son
--    téléphone, le restaurant (nom de la fiche, ou raison sociale Sirene) et où il en est ;
--  - activité récente : « Nouveau compte restaurateur » indique l'e-mail et le restaurant.
-- Seule la fonction team_dashboard est remplacée (mêmes chiffres qu'avant, deux ajouts). Réservé à l'équipe.
begin;

create or replace function private.team_dashboard(p_days integer default 30) returns jsonb
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

    -- Comptes restaurateur (les plus récents d'abord) : e-mail, responsable, restaurant, où il en est
    'merchant_accounts', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select p.created_at, u.email, u.email_confirmed_at is not null as confirmed, u.last_sign_in_at,
               nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as owner, p.phone,
               m.id as merchant_id, m.name as restaurant, mp.legal_name, coalesce(m.status::text, 'no_fiche') as status,
               coalesce(m.is_test, false) as is_test, p.created_at >= since_ts as new_in_period
        from public.profiles p join auth.users u on u.id = p.id
        left join public.merchants m on m.user_id = p.id left join public.merchant_private mp on mp.merchant_id = m.id
        where p.role = 'merchant'
        order by p.created_at desc limit 100) x
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
        select m.id, coalesce(m.name, '(fiche pas encore créée)') as name, coalesce(m.status::text, 'no_fiche') as status,
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
        select rv.id, rv.merchant_id, m.name as merchant, rv.rating, left(rv.comment, 280) as comment, rv.author_name, rv.created_at, rv.reported_at
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
        (select p.created_at as at, 'client_signup' as type, null::text as label, null::text as detail
           from public.profiles p where p.role = 'student' and p.created_at > now() - interval '30 days' order by p.created_at desc limit 25)
        union all
        -- Nouveau restaurateur : son e-mail et le nom de son restaurant (s'il a déjà créé sa fiche)
        (select p.created_at, 'merchant_signup', coalesce(m.name, mp.legal_name), u.email
           from public.profiles p join auth.users u on u.id = p.id
           left join public.merchants m on m.user_id = p.id left join public.merchant_private mp on mp.merchant_id = m.id
           where p.role = 'merchant' and p.created_at > now() - interval '30 days' order by p.created_at desc limit 25)
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

notify pgrst, 'reload schema';
commit;
