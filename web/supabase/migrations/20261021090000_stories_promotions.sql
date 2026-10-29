-- =============================================================================
-- Stories (24 h) et promotions des restaurateurs
--
-- Visibilité : tout le monde (visiteurs compris) voit les stories et promotions EN COURS des commerces en ligne,
-- sans avoir à s'abonner. Le restaurateur gère uniquement les siennes.
-- Photos des stories : stockage Supabase « stories », dossier = identifiant de la fiche du restaurateur.
-- Aucune suppression d'objet existant (migration non destructive).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Promotions
-- -----------------------------------------------------------------------------
create type public.promotion_kind as enum ('day', 'week', 'student', 'other');

create table public.promotions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  kind        public.promotion_kind not null,
  title       text not null check (char_length(btrim(title)) between 3 and 60),
  details     text check (details is null or char_length(details) <= 140),
  created_at  timestamptz not null default now(),
  ends_at     timestamptz check (ends_at is null or ends_at > created_at)
);
create index promotions_merchant_idx on public.promotions (merchant_id, ends_at);
comment on table public.promotions is 'Promotions (du jour, de la semaine, étudiantes, bons plans). Publiques tant qu''elles sont en cours.';

-- -----------------------------------------------------------------------------
-- 2. Stories
-- -----------------------------------------------------------------------------
create table public.stories (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- photo : « <id de la fiche>/<nom>.jpg » dans le stockage « stories » (sinon story texte sur fond coloré)
  image_path  text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'),
  background  text check (background is null or background in ('sunset', 'ocean', 'berry', 'forest', 'night')),
  caption     text check (caption is null or char_length(caption) <= 150),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  check (image_path is not null or (background is not null and char_length(btrim(coalesce(caption, ''))) >= 3)),
  check (image_path is null or split_part(image_path, '/', 1) = merchant_id::text),
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
create index stories_merchant_idx on public.stories (merchant_id, expires_at);
comment on table public.stories is 'Stories des restaurateurs : visibles par tous pendant 24 h au plus.';

-- -----------------------------------------------------------------------------
-- 3. Règles serveur : fin automatique des promos, limites, compteur de vues des stories
-- -----------------------------------------------------------------------------
create function private.promotions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  -- Promo du jour : ce soir minuit ; promo de la semaine : dimanche soir (heure de Paris)
  if new.kind = 'day' then
    new.ends_at := ((v_today + 1)::timestamp at time zone 'Europe/Paris');
  elsif new.kind = 'week' then
    new.ends_at := ((v_today + 1 + (7 - extract(isodow from v_today)::int))::timestamp at time zone 'Europe/Paris');
  end if;
  if (select count(*) from public.promotions p where p.merchant_id = new.merchant_id and (p.ends_at is null or p.ends_at > now())) >= 6 then
    raise exception 'Six promotions en cours au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger promotions_guard before insert on public.promotions for each row execute function private.promotions_guard();

create function private.stories_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.stories s where s.merchant_id = new.merchant_id and s.expires_at > now()) >= 10 then
    raise exception 'Dix stories en ligne au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger stories_guard before insert on public.stories for each row execute function private.stories_guard();

-- Affichages des stories, comptés comme les autres évènements de la fiche
alter table public.merchant_stats add column story_views integer not null default 0 check (story_views >= 0);

create or replace function private.track_merchant_event(p_merchant_id uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Europe/Paris')::date;
  v_uid uuid := (select auth.uid());
begin
  if p_event not in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story') then
    raise exception 'Évènement inconnu : %', p_event using errcode = '22023';
  end if;
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open
                 and m.user_id is distinct from v_uid) then
    return;
  end if;
  insert into public.merchant_stats as s (merchant_id, day, views, walk_clicks, car_clicks, phone_clicks, menu_views, photo_views, story_views)
  values (p_merchant_id, v_day, (p_event = 'view')::int, (p_event = 'walk')::int, (p_event = 'car')::int,
          (p_event = 'phone')::int, (p_event = 'menu')::int, (p_event = 'photos')::int, (p_event = 'story')::int)
  on conflict (merchant_id, day) do update set
    views = s.views + excluded.views,
    walk_clicks = s.walk_clicks + excluded.walk_clicks,
    car_clicks = s.car_clicks + excluded.car_clicks,
    phone_clicks = s.phone_clicks + excluded.phone_clicks,
    menu_views = s.menu_views + excluded.menu_views,
    photo_views = s.photo_views + excluded.photo_views,
    story_views = s.story_views + excluded.story_views;
  if p_event = 'view' and v_uid is not null then
    insert into public.merchant_visitors (merchant_id, day, visitor_id) values (p_merchant_id, v_day, v_uid)
    on conflict do nothing;
  end if;
end;
$$;

-- Fiche en ligne et visible ? (utilisée par les politiques de lecture, y compris pour les visiteurs)
create function private.merchant_is_live(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open)
$$;
revoke execute on function private.merchant_is_live(uuid), private.promotions_guard(), private.stories_guard() from public;
grant execute on function private.merchant_is_live(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Privilèges et RLS
-- -----------------------------------------------------------------------------
revoke all on public.promotions, public.stories from anon, authenticated;
grant all on public.promotions, public.stories to service_role;
grant select on public.promotions, public.stories to anon, authenticated;
grant insert (merchant_id, kind, title, details, ends_at) on public.promotions to authenticated;
grant insert (merchant_id, image_path, background, caption) on public.stories to authenticated;
grant delete on public.promotions, public.stories to authenticated;

alter table public.promotions enable row level security;
alter table public.stories    enable row level security;

create policy "promotions : lecture des offres en cours (visiteurs)" on public.promotions
  for select to anon using ((ends_at is null or ends_at > now()) and private.merchant_is_live(merchant_id));
create policy "promotions : lecture (offres en cours et les siennes)" on public.promotions
  for select to authenticated using (private.is_merchant_owner(merchant_id) or ((ends_at is null or ends_at > now()) and private.merchant_is_live(merchant_id)));
create policy "promotions : le restaurateur publie sur sa fiche" on public.promotions
  for insert to authenticated with check (private.is_merchant_owner(merchant_id));
create policy "promotions : le restaurateur retire les siennes" on public.promotions
  for delete to authenticated using (private.is_merchant_owner(merchant_id));

create policy "stories : lecture des stories en ligne (visiteurs)" on public.stories
  for select to anon using (expires_at > now() and private.merchant_is_live(merchant_id));
create policy "stories : lecture (stories en ligne et les siennes)" on public.stories
  for select to authenticated using (private.is_merchant_owner(merchant_id) or (expires_at > now() and private.merchant_is_live(merchant_id)));
create policy "stories : le restaurateur publie sur sa fiche" on public.stories
  for insert to authenticated with check (private.is_merchant_owner(merchant_id) and private.merchant_is_live(merchant_id));
create policy "stories : le restaurateur supprime les siennes" on public.stories
  for delete to authenticated using (private.is_merchant_owner(merchant_id));

-- -----------------------------------------------------------------------------
-- 5. Stockage des photos des stories (5 Mo, images uniquement)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "stories (fichiers) : dépôt dans le dossier de sa fiche" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stories' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));
create policy "stories (fichiers) : suppression des siens" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stories' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));

-- Temps réel : nouvelles stories et promotions visibles sans recharger la page
alter publication supabase_realtime add table public.stories, public.promotions;
