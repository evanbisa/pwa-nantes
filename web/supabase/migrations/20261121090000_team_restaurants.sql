-- Équipe FlashMiam : fiche complète de chaque restaurant et modération des avis (/app/tableau-de-bord/restaurants/)
--  1. merchant_analytics(fiche, jours) : les statistiques du restaurateur, pour n'importe quelle fiche. Le tableau de
--     bord du restaurateur (my_merchant_analytics) passe par elle : mêmes chiffres des deux côtés, sans copie.
--  2. Justificatifs (espace « documents », privé) : lisibles aussi par l'équipe, pour les vérifier.
--  3. team_merchants() : tous les restaurants inscrits (et les comptes restaurateur sans fiche), avec leurs
--     justificatifs, SIRET, abonnement et chiffres clés. team_merchant(fiche, jours) : tout sur une fiche.
--  4. team_moderate_review(avis, action) : supprimer un avis, ou le garder (signalement levé). Chaque décision est
--     notée dans team_actions (qui, quand, quel restaurant), gardée 13 mois.
--  5. team_dashboard : identifiants des restaurants à relancer et des avis signalés (liens vers leur fiche).
begin;

-- 1. Statistiques d'une fiche ---------------------------------------------------------------------------------
create function private.merchant_analytics(p_merchant_id uuid, p_days integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
  v_to date := (now() at time zone 'Europe/Paris')::date;
  v_from date := v_to - (v_days - 1);
  v_pfrom date := v_from - v_days;
  v_pto date := v_from - 1;
  v_since timestamptz;
  v_psince timestamptz;
  v_result jsonb;
begin
  select m.id into v_id from public.merchants m where m.id = p_merchant_id;
  if v_id is null then
    return null;
  end if;
  v_since := v_from::timestamp at time zone 'Europe/Paris';
  v_psince := v_pfrom::timestamp at time zone 'Europe/Paris';

  with
  st as (
    select coalesce(sum(views), 0) views, coalesce(sum(walk_clicks), 0) walk, coalesce(sum(car_clicks), 0) car,
           coalesce(sum(phone_clicks), 0) phone, coalesce(sum(menu_views), 0) menu, coalesce(sum(photo_views), 0) photos,
           coalesce(sum(story_views), 0) story_views
    from public.merchant_stats where merchant_id = v_id and day between v_from and v_to),
  pst as (
    select coalesce(sum(views), 0) views, coalesce(sum(walk_clicks + car_clicks), 0) routes, coalesce(sum(phone_clicks), 0) phone,
           coalesce(sum(menu_views), 0) menu, coalesce(sum(story_views), 0) story_views
    from public.merchant_stats where merchant_id = v_id and day between v_pfrom and v_pto),
  ev as (
    select event, count(*)::int n from public.merchant_event_visitors
    where merchant_id = v_id and day between v_from and v_to group by event),
  pev as (
    select event, count(*)::int n from public.merchant_event_visitors
    where merchant_id = v_id and day between v_pfrom and v_pto group by event),
  vis as (
    select visitor_id, count(*) days from public.merchant_visitors
    where merchant_id = v_id and day between v_from and v_to group by visitor_id),
  pvis as (
    select count(distinct visitor_id)::int n from public.merchant_visitors where merchant_id = v_id and day between v_pfrom and v_pto),
  days as (select generate_series(v_from, v_to, interval '1 day')::date as day)
  select jsonb_build_object(
    'period', jsonb_build_object('days', v_days, 'from', v_from, 'to', v_to),
    'totals', jsonb_build_object(
      'views', st.views, 'walk', st.walk, 'car', st.car, 'phone', st.phone, 'menu', st.menu, 'photos', st.photos,
      'story_views', st.story_views,
      'visitors', (select count(*) from vis),
      'returning', (select count(*) from vis where days >= 2),
      'followers', (select count(*) from public.follows f where f.merchant_id = v_id),
      'new_followers', (select count(*) from public.follows f where f.merchant_id = v_id and f.created_at >= v_since),
      'lost_followers', coalesce((select n from ev where event = 'unfollow'), 0),
      'shares', coalesce((select n from ev where event = 'share'), 0),
      'reviews_tab', coalesce((select n from ev where event = 'reviews'), 0),
      'google', coalesce((select n from ev where event = 'google'), 0),
      'story_cta', coalesce((select n from ev where event = 'story_cta'), 0),
      'story_likes', (select count(*) from public.story_likes l join public.stories s on s.id = l.story_id
                      where s.merchant_id = v_id and l.created_at >= v_since),
      'offer_clicks', (select count(*) from public.promo_clicks c join public.promotions p on p.id = c.promo_id
                       where p.merchant_id = v_id and c.clicked_at >= v_since),
      'dish_likes', (select count(*) from public.dish_likes d where d.merchant_id = v_id),
      'reviews', (select count(*) from public.reviews r where r.merchant_id = v_id),
      'rating', (select round(avg(r.rating), 1) from public.reviews r where r.merchant_id = v_id),
      'new_reviews', (select count(*) from public.reviews r where r.merchant_id = v_id and r.created_at >= v_since),
      'unanswered', (select count(*) from public.reviews r where r.merchant_id = v_id and r.reply is null)),
    'previous', jsonb_build_object(
      'views', pst.views, 'routes', pst.routes, 'phone', pst.phone, 'menu', pst.menu, 'story_views', pst.story_views,
      'visitors', (select n from pvis),
      'new_followers', (select count(*) from public.follows f where f.merchant_id = v_id and f.created_at >= v_psince and f.created_at < v_since),
      'shares', coalesce((select n from pev where event = 'share'), 0)),
    'sources', jsonb_build_object(
      'map', coalesce((select n from ev where event = 'from_map'), 0),
      'list', coalesce((select n from ev where event = 'from_list'), 0),
      'search', coalesce((select n from ev where event = 'from_search'), 0),
      'offers', coalesce((select n from ev where event = 'from_offers'), 0),
      'story', coalesce((select n from ev where event = 'from_story'), 0),
      'notif', coalesce((select n from ev where event = 'from_notif'), 0),
      'link', coalesce((select n from ev where event = 'from_link'), 0)),
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'views', coalesce(s.views, 0),
        'visitors', (select count(*) from public.merchant_visitors v where v.merchant_id = v_id and v.day = d.day),
        'routes', coalesce(s.walk_clicks + s.car_clicks, 0),
        'phone', coalesce(s.phone_clicks, 0),
        'story_views', coalesce(s.story_views, 0),
        'new_followers', (select count(*) from public.follows f where f.merchant_id = v_id and (f.created_at at time zone 'Europe/Paris')::date = d.day))
        order by d.day)
      from days d left join public.merchant_stats s on s.merchant_id = v_id and s.day = d.day),
    'hours', (select jsonb_agg(coalesce((select sum(h.views) from public.merchant_view_hours h
                                          where h.merchant_id = v_id and h.day between v_from and v_to and h.hour = g), 0) order by g)
              from generate_series(0, 23) g),
    'stories', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'caption', s.caption, 'background', s.background, 'image_path', s.image_path,
        'created_at', s.created_at, 'expires_at', s.expires_at,
        'views', (select count(*) from public.story_viewers v where v.story_id = s.id),
        'likes', (select count(*) from public.story_likes l where l.story_id = s.id),
        'clicks', (select count(*) from public.story_viewers v where v.story_id = s.id and v.clicked))
        order by s.created_at desc)
      from public.stories s where s.merchant_id = v_id and s.created_at >= now() - interval '30 days'), '[]'::jsonb),
    'promos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'title', p.title, 'created_at', p.created_at, 'ends_at', p.ends_at,
        'active', p.ends_at is null or p.ends_at > now(),
        'clicks', (select count(*) from public.promo_clicks c where c.promo_id = p.id))
        order by p.created_at desc)
      from public.promotions p where p.merchant_id = v_id and (p.ends_at is null or p.ends_at > now() - interval '30 days')), '[]'::jsonb),
    -- Public de la période (personnes différentes) : seulement à partir de 5 personnes, jamais qui
    'audience', (select case when count(*) >= 5 then jsonb_build_object(
        'total', count(*),
        'female', count(*) filter (where p.gender = 'female'),
        'male', count(*) filter (where p.gender = 'male'),
        'other', count(*) filter (where p.gender = 'other'),
        'gender_unknown', count(*) filter (where p.gender is null),
        'age_15_17', count(*) filter (where a.age between 15 and 17),
        'age_18_24', count(*) filter (where a.age between 18 and 24),
        'age_25_34', count(*) filter (where a.age between 25 and 34),
        'age_35_49', count(*) filter (where a.age between 35 and 49),
        'age_50', count(*) filter (where a.age >= 50),
        'age_unknown', count(*) filter (where a.age is null or a.age < 15)) end
      from (select distinct v.visitor_id from public.merchant_visitors v where v.merchant_id = v_id and v.day between v_from and v_to) x
      join public.profiles p on p.id = x.visitor_id
      cross join lateral (select extract(year from v_to)::int - p.birth_year as age) a),
    'dishes', coalesce((select jsonb_agg(jsonb_build_object('dish', x.dish, 'likes', x.likes) order by x.likes desc, x.dish)
      from (select d.dish, count(*)::int likes from public.dish_likes d where d.merchant_id = v_id
            group by d.dish order by count(*) desc, d.dish limit 10) x), '[]'::jsonb)
  ) into v_result
  from st, pst;
  return v_result;
end;
$$;
revoke all on function private.merchant_analytics(uuid, integer) from public, anon, authenticated;

-- Le restaurateur connecté : sa fiche, mêmes chiffres qu'avant (null s'il n'en a pas)
create or replace function private.my_merchant_analytics(p_days integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.merchant_analytics((select m.id from public.merchants m where m.user_id = (select auth.uid())), p_days)
$$;

-- 2. Justificatifs lisibles par l'équipe -------------------------------------------------------------------------
create policy "documents : lecture par l'équipe" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.is_team_admin());

-- 3. Journal de modération ----------------------------------------------------------------------------------------
create table public.team_actions (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null check (action in ('review_deleted', 'review_kept')),
  merchant_id uuid references public.merchants (id) on delete cascade,
  detail      text check (char_length(detail) <= 500)
);
create index team_actions_merchant_idx on public.team_actions (merchant_id, at desc);
create index team_actions_user_idx on public.team_actions (user_id);
comment on table public.team_actions is 'Décisions de modération de l''équipe (avis supprimés ou gardés). Jamais lisible depuis le site ; gardé 13 mois.';
revoke all on public.team_actions from anon, authenticated;
grant all on public.team_actions to service_role;
alter table public.team_actions enable row level security;
create policy "team_actions : aucun accès direct" on public.team_actions for all to anon, authenticated using (false) with check (false);

-- 4. Liste des restaurants -----------------------------------------------------------------------------------------
create function private.team_merchants() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  if not private.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
    from (
      select m.id, p.id as user_id, m.name, m.category, coalesce(m.status::text, 'no_fiche') as status,
             coalesce(m.is_test, false) as is_test, coalesce(m.created_at, p.created_at) as created_at, m.published_at,
             nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as owner, u.email, p.phone,
             mp.siret, mp.siret_verified_at is not null as siret_verified, mp.legal_name,
             case when s.merchant_id is null then null else jsonb_build_object(
               'status', s.status, 'mode', s.mode, 'plan', s.plan, 'period', s.period,
               'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end) end as subscription,
             jsonb_build_object(
               'kbis',     exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name like m.id::text || '/kbis--%'),
               'hygiene',  exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name like m.id::text || '/hygiene--%'),
               'ddpp',     exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name like m.id::text || '/ddpp--%'),
               'licence',  exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name like m.id::text || '/licence--%')
             ) as docs,
             coalesce((select sum(st.views) from public.merchant_stats st where st.merchant_id = m.id and st.day > today - 30), 0) as views_30d,
             (select count(*) from public.follows f where f.merchant_id = m.id) as followers,
             (select count(*) from public.reviews r where r.merchant_id = m.id) as reviews,
             (select round(avg(r.rating), 1) from public.reviews r where r.merchant_id = m.id) as rating,
             (select count(*) from public.reviews r where r.merchant_id = m.id and r.reported_at is not null) as reported,
             (select count(*) from public.visits v where v.merchant_id = m.id and v.visited_at > now() - interval '30 days') as qr_visits_30d
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.merchants m on m.user_id = p.id
      left join public.merchant_private mp on mp.merchant_id = m.id
      left join public.merchant_subscriptions s on s.merchant_id = m.id
      where p.role = 'merchant'
    ) x
  );
end $$;
revoke all on function private.team_merchants() from public, anon;
grant execute on function private.team_merchants() to authenticated, service_role;

-- Tout sur une fiche : restaurant, entreprise, responsable, abonnement, justificatifs, statistiques, avis
create function private.team_merchant(p_merchant_id uuid, p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_m public.merchants;
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  if not private.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam' using errcode = '42501';
  end if;
  select * into v_m from public.merchants where id = p_merchant_id;
  if not found then
    raise exception 'Restaurant introuvable' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'merchant', to_jsonb(v_m),
    'docs_ok', private.merchant_docs_ok(v_m.id),
    'legal', (select jsonb_build_object(
                'siret', mp.siret, 'verified_at', mp.siret_verified_at, 'legal_name', mp.legal_name, 'naf_code', mp.naf_code,
                'sirene', mp.sirene_snapshot -> 'etablissement')
              from public.merchant_private mp where mp.merchant_id = v_m.id),
    'owner', (select jsonb_build_object(
                'first_name', p.first_name, 'last_name', p.last_name, 'email', u.email, 'phone', p.phone,
                'created_at', p.created_at, 'last_sign_in_at', u.last_sign_in_at, 'email_confirmed', u.email_confirmed_at is not null,
                'terms_version', p.terms_version, 'terms_accepted_at', p.terms_accepted_at)
              from public.profiles p join auth.users u on u.id = p.id where p.id = v_m.user_id),
    'subscription', (select jsonb_build_object(
                'status', s.status, 'mode', s.mode, 'plan', s.plan, 'period', s.period, 'started_at', s.started_at,
                'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end, 'updated_at', s.updated_at)
              from public.merchant_subscriptions s where s.merchant_id = v_m.id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                'path', o.name, 'size', (o.metadata ->> 'size')::bigint, 'mime', o.metadata ->> 'mimetype', 'uploaded_at', o.created_at)
                order by o.created_at desc), '[]'::jsonb)
              from storage.objects o where o.bucket_id = 'documents' and o.name like v_m.id::text || '/%'),
    'analytics', private.merchant_analytics(v_m.id, p_days),
    'visits', (select jsonb_build_object(
                'today',       count(*) filter (where (v.visited_at at time zone 'Europe/Paris')::date = today),
                'last_7d',     count(*) filter (where v.visited_at > now() - interval '7 days'),
                'last_30d',    count(*) filter (where v.visited_at > now() - interval '30 days'),
                'promo_30d',   count(*) filter (where v.visited_at > now() - interval '30 days' and v.promo_title is not null),
                'clients_30d', count(distinct v.user_id) filter (where v.visited_at > now() - interval '30 days'))
              from public.visits v where v.merchant_id = v_m.id),
    'reviews', (select coalesce(jsonb_agg(r order by r.reported_at desc nulls last, r.created_at desc), '[]'::jsonb) from (
                select rv.id, rv.rating, rv.comment, rv.author_name, rv.reply, rv.replied_at, rv.created_at, rv.reported_at
                from public.reviews rv where rv.merchant_id = v_m.id
                order by rv.reported_at desc nulls last, rv.created_at desc limit 50) r),
    'actions', (select coalesce(jsonb_agg(a order by a.at desc), '[]'::jsonb) from (
                select ta.at, ta.action, ta.detail, coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Équipe') as who
                from public.team_actions ta left join public.profiles p on p.id = ta.user_id
                where ta.merchant_id = v_m.id order by ta.at desc limit 20) a)
  );
end $$;
revoke all on function private.team_merchant(uuid, integer) from public, anon;
grant execute on function private.team_merchant(uuid, integer) to authenticated, service_role;

-- 5. Modération des avis -----------------------------------------------------------------------------------------
create function private.team_moderate_review(p_review_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.reviews;
begin
  if not private.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam' using errcode = '42501';
  end if;
  select * into r from public.reviews where id = p_review_id;
  if not found then
    raise exception 'Avis introuvable' using errcode = 'P0002';
  end if;
  if p_action = 'delete' then
    delete from public.notifications where ref_id = r.id and kind in ('review', 'reply');
    delete from public.reviews where id = r.id;
    insert into public.team_actions (user_id, action, merchant_id, detail)
    values ((select auth.uid()), 'review_deleted', r.merchant_id,
            left(repeat('★', r.rating) || repeat('☆', 5 - r.rating) || coalesce(' « ' || r.comment || ' »', ''), 500));
  elsif p_action = 'keep' then
    update public.reviews set reported_at = null where id = r.id;   -- signalement levé : l'avis reste en ligne
    insert into public.team_actions (user_id, action, merchant_id, detail)
    values ((select auth.uid()), 'review_kept', r.merchant_id,
            left(repeat('★', r.rating) || repeat('☆', 5 - r.rating) || coalesce(' « ' || r.comment || ' »', ''), 500));
  else
    raise exception 'Action inconnue' using errcode = '22023';
  end if;
  delete from public.team_actions where at < now() - interval '395 days';
end $$;
revoke all on function private.team_moderate_review(uuid, text) from public, anon;
grant execute on function private.team_moderate_review(uuid, text) to authenticated, service_role;

-- Relais publics (API), sans privilège
create function public.team_merchants() returns jsonb
language sql stable set search_path = '' as $$ select private.team_merchants() $$;
create function public.team_merchant(p_merchant_id uuid, p_days integer default 30) returns jsonb
language sql stable set search_path = '' as $$ select private.team_merchant(p_merchant_id, p_days) $$;
create function public.team_moderate_review(p_review_id uuid, p_action text) returns void
language sql set search_path = '' as $$ select private.team_moderate_review(p_review_id, p_action) $$;
revoke all on function public.team_merchants(), public.team_merchant(uuid, integer), public.team_moderate_review(uuid, text) from public, anon;
grant execute on function public.team_merchants(), public.team_merchant(uuid, integer), public.team_moderate_review(uuid, text) to authenticated, service_role;

-- 6. Tableau de bord : identifiants des restaurants à relancer et des avis signalés --------------------------------
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

notify pgrst, 'reload schema';
commit;
