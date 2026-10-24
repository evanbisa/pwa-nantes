-- =============================================================================
-- Inscription en étapes : sexe et âge (facultatifs pour le sexe, âge minimum 15 ans demandé par le site).
--  - profiles.gender : 'female' | 'male' | 'other' | null (« je préfère ne pas le dire »)
--  - profiles.birth_year : année de naissance (déduite de l'âge indiqué), jamais la date exacte
-- Repris à la création du compte (métadonnées de l'inscription, valeurs contrôlées), modifiables par la personne.
-- Usage : statistiques d'audience des restaurateurs, en totaux seulement et à partir de 5 personnes.
-- Aucune suppression d'objet existant (migration non destructive).
-- =============================================================================
alter table public.profiles add column if not exists gender text check (gender in ('female', 'male', 'other'));
alter table public.profiles add column if not exists birth_year smallint check (birth_year between 1900 and 2100);
comment on column public.profiles.gender is 'Sexe déclaré (facultatif) : female, male, other ; vide = non précisé.';
comment on column public.profiles.birth_year is 'Année de naissance déduite de l''âge déclaré (jamais la date exacte).';

grant update (gender, birth_year) on public.profiles to authenticated;

-- Âge plausible : 15 ans au moins (règle du site), 110 ans au plus ; sinon non renseigné
create or replace function private.valid_birth_year(p_value text)
returns smallint language sql stable set search_path = '' as $$
  select case when p_value ~ '^[0-9]{4}$'
    and p_value::int between extract(year from now())::int - 110 and extract(year from now())::int - 15
    then p_value::smallint end
$$;
revoke execute on function private.valid_birth_year(text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, first_name, last_name, phone, gender, birth_year)
  values (
    new.id,
    -- toute autre valeur (ex. « admin ») donne un compte étudiant
    case when meta ->> 'role' = 'merchant' then 'merchant'::public.user_role else 'student'::public.user_role end,
    nullif(left(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', split_part(coalesce(meta ->> 'full_name', meta ->> 'name', ''), ' ', 1))), 60), ''),
    nullif(left(trim(meta ->> 'last_name'), 60), ''),
    case when meta ->> 'phone' ~ '^\+?[0-9 .]{10,20}$' then meta ->> 'phone' end,
    case when meta ->> 'gender' in ('female', 'male', 'other') then meta ->> 'gender' end,
    private.valid_birth_year(meta ->> 'birth_year')
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Tableau de bord du restaurateur : ajout du public de la période (« audience »)
create or replace function private.my_merchant_analytics(p_days integer)
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
  select m.id into v_id from public.merchants m where m.user_id = (select auth.uid());
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
