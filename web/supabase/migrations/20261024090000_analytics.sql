-- =============================================================================
-- Statistiques détaillées pour les restaurateurs : tout ce que font les clients sur leur fiche.
--
-- Ce qui est mesuré : provenance des visites (carte, liste, recherche, offres, story, notification, lien partagé),
-- heures de consultation, partages, onglet Avis, lien Google, vues et « j'aime » de chaque story, clics vers la fiche
-- depuis une story, clics sur chaque offre, « j'aime » des plats, désabonnements, clients qui reviennent.
--
-- Confidentialité : le restaurateur ne voit que des TOTAUX (my_merchant_analytics), jamais qui a fait quoi.
-- Les lignes par personne servent à compter chaque personne une seule fois ; aucune n'est lisible par le
-- restaurateur. Effacées après 90 jours.
-- Aucune suppression d'objet existant (migration non destructive).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
-- Actions comptées une fois par personne et par jour
create table public.merchant_event_visitors (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  day         date not null,
  event       text not null check (event in (
                'from_map', 'from_list', 'from_search', 'from_offers', 'from_story', 'from_notif', 'from_link',
                'share', 'reviews', 'google', 'story_cta', 'unfollow')),
  visitor_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (merchant_id, day, event, visitor_id)
);
create index merchant_event_visitors_visitor_idx on public.merchant_event_visitors (visitor_id);
create index merchant_event_visitors_day_idx on public.merchant_event_visitors (day);
comment on table public.merchant_event_visitors is 'Actions des clients sur une fiche (une par personne et par jour). Jamais lisibles : seuls les totaux sont communiqués.';

-- Vues de la fiche par heure (heure de Paris)
create table public.merchant_view_hours (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  day         date not null,
  hour        smallint not null check (hour between 0 and 23),
  views       integer not null default 0 check (views >= 0),
  primary key (merchant_id, day, hour)
);
create index merchant_view_hours_day_idx on public.merchant_view_hours (day);

-- Chaque story : qui l'a vue (une fois), et a-t-il ouvert la fiche ensuite ; « j'aime »
create table public.story_viewers (
  story_id   uuid not null references public.stories (id) on delete cascade,
  visitor_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  clicked    boolean not null default false,
  primary key (story_id, visitor_id)
);
create index story_viewers_visitor_idx on public.story_viewers (visitor_id);
create table public.story_likes (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index story_likes_user_idx on public.story_likes (user_id);

-- Clics sur chaque offre (« Offres autour de moi », notification de promo)
create table public.promo_clicks (
  promo_id   uuid not null references public.promotions (id) on delete cascade,
  visitor_id uuid not null references public.profiles (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  primary key (promo_id, visitor_id)
);
create index promo_clicks_visitor_idx on public.promo_clicks (visitor_id);

-- « J'aime » des plats de la carte (nom du plat)
create table public.dish_likes (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  dish        text not null check (char_length(dish) between 1 and 80),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (merchant_id, dish, user_id)
);
create index dish_likes_user_idx on public.dish_likes (user_id);

-- -----------------------------------------------------------------------------
-- 2. Enregistrement des interactions (un seul point d'entrée pour le site)
-- -----------------------------------------------------------------------------
create function private.track_visit(p_merchant_id uuid, p_event text, p_ref uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamp := now() at time zone 'Europe/Paris';
  v_day date := v_now::date;
  v_hour smallint := extract(hour from v_now)::smallint;
begin
  if p_event not in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story', 'share', 'reviews', 'google', 'story_cta', 'offer') then
    raise exception 'Évènement inconnu : %', p_event using errcode = '22023';
  end if;
  -- fiche en ligne, et jamais les visites du restaurateur sur sa propre fiche
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open
                 and m.user_id is distinct from v_uid) then
    return;
  end if;
  if p_event in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story') then
    perform private.track_merchant_event(p_merchant_id, p_event);
  end if;
  if p_event = 'view' then
    insert into public.merchant_view_hours as h (merchant_id, day, hour, views) values (p_merchant_id, v_day, v_hour, 1)
    on conflict (merchant_id, day, hour) do update set views = h.views + 1;
  end if;
  if v_uid is null then
    return;
  end if;
  -- provenance de la visite
  if p_event = 'view' and p_source in ('map', 'list', 'search', 'offers', 'story', 'notif', 'link') then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (p_merchant_id, v_day, 'from_' || p_source, v_uid) on conflict do nothing;
  end if;
  if p_event in ('share', 'reviews', 'google', 'story_cta') then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (p_merchant_id, v_day, p_event, v_uid) on conflict do nothing;
  end if;
  -- story vue / fiche ouverte depuis la story (story de ce restaurant uniquement)
  if p_event in ('story', 'story_cta') and p_ref is not null
     and exists (select 1 from public.stories s where s.id = p_ref and s.merchant_id = p_merchant_id) then
    insert into public.story_viewers as v (story_id, visitor_id, clicked) values (p_ref, v_uid, p_event = 'story_cta')
    on conflict (story_id, visitor_id) do update set clicked = v.clicked or excluded.clicked;
  end if;
  -- clic sur une offre de ce restaurant
  if p_event = 'offer' and p_ref is not null
     and exists (select 1 from public.promotions p where p.id = p_ref and p.merchant_id = p_merchant_id) then
    insert into public.promo_clicks (promo_id, visitor_id) values (p_ref, v_uid) on conflict do nothing;
  end if;
  -- ménage au fil de l'eau : 90 jours d'historique
  if random() < 0.02 then
    delete from public.merchant_event_visitors where day < v_day - 90;
    delete from public.merchant_view_hours where day < v_day - 90;
  end if;
end;
$$;

-- « J'aime » une story en ligne (pas la sienne) ; renvoie l'état final
create function private.toggle_story_like(p_story_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stories s join public.merchants m on m.id = s.merchant_id
                 where s.id = p_story_id and s.expires_at > now() and m.status = 'published' and m.is_open and m.user_id <> v_uid) then
    raise exception 'Story indisponible.' using errcode = '42501';
  end if;
  delete from public.story_likes where story_id = p_story_id and user_id = v_uid;
  if found then return false; end if;
  insert into public.story_likes (story_id, user_id) values (p_story_id, v_uid);
  return true;
end;
$$;

-- « J'aime » un plat de la carte d'un restaurant en ligne (pas le sien) ; renvoie l'état final
create function private.toggle_dish_like(p_merchant_id uuid, p_dish text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_dish text := btrim(p_dish);
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open and m.user_id <> v_uid
                 and exists (select 1 from jsonb_array_elements(m.menu_json) it where btrim(it ->> 'name') = v_dish)) then
    raise exception 'Plat introuvable.' using errcode = '42501';
  end if;
  delete from public.dish_likes where merchant_id = p_merchant_id and dish = v_dish and user_id = v_uid;
  if found then return false; end if;
  insert into public.dish_likes (merchant_id, dish, user_id) values (p_merchant_id, v_dish, v_uid);
  return true;
end;
$$;

-- Nombre de « j'aime » de chaque plat d'un restaurant en ligne (affiché sur la carte, pour tous)
create function private.dish_like_counts(p_merchant_id uuid)
returns table (dish text, likes integer) language sql stable security definer set search_path = '' as $$
  select d.dish, count(*)::int from public.dish_likes d
  join public.merchants m on m.id = d.merchant_id
  where d.merchant_id = p_merchant_id and m.status = 'published' and m.is_open
  group by d.dish
$$;

-- Désabonnement : compté (une fois par personne et par jour), sauf suppression du compte ou de la fiche
create function private.count_unfollow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = old.user_id)
     and exists (select 1 from public.merchants m where m.id = old.merchant_id) then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (old.merchant_id, (now() at time zone 'Europe/Paris')::date, 'unfollow', old.user_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger count_unfollow after delete on public.follows for each row execute function private.count_unfollow();

-- -----------------------------------------------------------------------------
-- 3. Tableau de bord du restaurateur connecté : tous les totaux d'une période (et de la précédente)
-- -----------------------------------------------------------------------------
create function private.my_merchant_analytics(p_days integer)
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
    'dishes', coalesce((select jsonb_agg(jsonb_build_object('dish', x.dish, 'likes', x.likes) order by x.likes desc, x.dish)
      from (select d.dish, count(*)::int likes from public.dish_likes d where d.merchant_id = v_id
            group by d.dish order by count(*) desc, d.dish limit 10) x), '[]'::jsonb)
  ) into v_result
  from st, pst;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Relais publics (API) et privilèges
-- -----------------------------------------------------------------------------
create function public.track_visit(p_merchant_id uuid, p_event text, p_ref uuid default null, p_source text default null)
returns void language sql security invoker set search_path = '' as $$ select private.track_visit(p_merchant_id, p_event, p_ref, p_source) $$;
create function public.toggle_story_like(p_story_id uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.toggle_story_like(p_story_id) $$;
create function public.toggle_dish_like(p_merchant_id uuid, p_dish text)
returns boolean language sql security invoker set search_path = '' as $$ select private.toggle_dish_like(p_merchant_id, p_dish) $$;
create function public.dish_like_counts(p_merchant_id uuid)
returns table (dish text, likes integer) language sql stable security invoker set search_path = '' as $$ select * from private.dish_like_counts(p_merchant_id) $$;
create function public.my_merchant_analytics(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.my_merchant_analytics(p_days) $$;

revoke execute on function private.track_visit(uuid, text, uuid, text), private.toggle_story_like(uuid), private.toggle_dish_like(uuid, text),
  private.dish_like_counts(uuid), private.count_unfollow(), private.my_merchant_analytics(integer),
  public.track_visit(uuid, text, uuid, text), public.toggle_story_like(uuid), public.toggle_dish_like(uuid, text),
  public.dish_like_counts(uuid), public.my_merchant_analytics(integer) from public, anon, authenticated;
grant execute on function private.track_visit(uuid, text, uuid, text), public.track_visit(uuid, text, uuid, text),
  private.dish_like_counts(uuid), public.dish_like_counts(uuid) to anon, authenticated;
grant execute on function private.toggle_story_like(uuid), private.toggle_dish_like(uuid, text), private.my_merchant_analytics(integer),
  public.toggle_story_like(uuid), public.toggle_dish_like(uuid, text), public.my_merchant_analytics(integer) to authenticated;

revoke all on public.merchant_event_visitors, public.merchant_view_hours, public.story_viewers, public.story_likes,
  public.promo_clicks, public.dish_likes from anon, authenticated;
grant all on public.merchant_event_visitors, public.merchant_view_hours, public.story_viewers, public.story_likes,
  public.promo_clicks, public.dish_likes to service_role;
-- Chacun peut savoir ce qu'il a aimé (pour afficher son cœur) ; rien d'autre n'est lisible
grant select on public.story_likes, public.dish_likes to authenticated;

alter table public.merchant_event_visitors enable row level security;
alter table public.merchant_view_hours     enable row level security;
alter table public.story_viewers           enable row level security;
alter table public.story_likes             enable row level security;
alter table public.promo_clicks            enable row level security;
alter table public.dish_likes              enable row level security;

create policy "story_likes : lecture des siens" on public.story_likes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dish_likes : lecture des siens" on public.dish_likes
  for select to authenticated using (user_id = (select auth.uid()));

-- Tables internes : refus explicite de tout accès direct (seules les fonctions de statistiques y accèdent)
create policy "merchant_event_visitors : aucun accès direct" on public.merchant_event_visitors
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "merchant_view_hours : aucun accès direct" on public.merchant_view_hours
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "story_viewers : aucun accès direct" on public.story_viewers
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "promo_clicks : aucun accès direct" on public.promo_clicks
  as restrictive for all to anon, authenticated using (false) with check (false);
