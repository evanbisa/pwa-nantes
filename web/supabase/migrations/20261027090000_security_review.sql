-- =============================================================================
-- Revue de sécurité des données (24 octobre 2026)
--  1. Avis : l'identifiant du compte de l'auteur n'est plus lisible par les autres (il permettait de relier
--     tous les avis d'une même personne). Chacun retrouve les siens avec my_reviews().
--  2. Statistiques : seules les personnes connectées sont comptées, au plus 50 actions par personne, par fiche
--     et par jour (impossible de gonfler les chiffres d'un restaurant) ; l'ancien compteur direct est fermé.
--  3. Photos des fiches : seulement des photos envoyées dans le dossier de la fiche (plus d'adresse vers un site
--     tiers, qui aurait pu suivre les visiteurs).
--  4. Ménage quotidien (fonction serveur « purge ») : table de suivi des passages.
-- Aucune suppression d'objet existant ni de donnée (migration non destructive).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Avis : identifiant de l'auteur masqué
-- -----------------------------------------------------------------------------
revoke select on public.reviews from anon, authenticated;
grant select (id, merchant_id, rating, comment, author_name, created_at, updated_at, reply, replied_at, reported_at)
  on public.reviews to anon, authenticated;

-- Avis de la personne connectée (un par restaurant)
create function private.my_reviews()
returns table (id uuid, merchant_id uuid) language sql stable security definer set search_path = '' as $$
  select r.id, r.merchant_id from public.reviews r where r.user_id = (select auth.uid())
$$;
create function public.my_reviews()
returns table (id uuid, merchant_id uuid) language sql stable security invoker set search_path = '' as $$
  select * from private.my_reviews()
$$;
revoke execute on function private.my_reviews(), public.my_reviews() from public, anon, authenticated;
grant execute on function private.my_reviews(), public.my_reviews() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Statistiques : personnes connectées seulement, 50 actions au plus par personne, fiche et jour
-- -----------------------------------------------------------------------------
create table public.visit_budget (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  day         date not null,
  visitor_id  uuid not null references public.profiles (id) on delete cascade,
  events      integer not null default 0 check (events >= 0),
  primary key (merchant_id, day, visitor_id)
);
create index visit_budget_day_idx on public.visit_budget (day);
create index visit_budget_visitor_idx on public.visit_budget (visitor_id);
comment on table public.visit_budget is 'Nombre d''actions comptées par personne, fiche et jour (plafond anti-triche). Jamais lisible ; effacé chaque jour.';
revoke all on public.visit_budget from anon, authenticated;
grant all on public.visit_budget to service_role;
alter table public.visit_budget enable row level security;
create policy "visit_budget : aucun accès direct" on public.visit_budget
  as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function private.track_visit(p_merchant_id uuid, p_event text, p_ref uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamp := now() at time zone 'Europe/Paris';
  v_day date := v_now::date;
  v_hour smallint := extract(hour from v_now)::smallint;
  v_events integer;
begin
  if p_event not in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story', 'share', 'reviews', 'google', 'story_cta', 'offer') then
    raise exception 'Évènement inconnu : %', p_event using errcode = '22023';
  end if;
  -- seules les personnes connectées sont comptées (le site demande un compte)
  if v_uid is null then
    return;
  end if;
  -- fiche en ligne, et jamais les visites du restaurateur sur sa propre fiche
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open
                 and m.user_id <> v_uid) then
    return;
  end if;
  -- 50 actions comptées au plus par personne, par fiche et par jour : personne ne peut gonfler les chiffres
  select b.events into v_events from public.visit_budget b
  where b.merchant_id = p_merchant_id and b.day = v_day and b.visitor_id = v_uid;
  if coalesce(v_events, 0) >= 50 then
    return;
  end if;
  insert into public.visit_budget as b (merchant_id, day, visitor_id, events) values (p_merchant_id, v_day, v_uid, 1)
  on conflict (merchant_id, day, visitor_id) do update set events = b.events + 1;

  if p_event in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story') then
    perform private.track_merchant_event(p_merchant_id, p_event);
  end if;
  if p_event = 'view' then
    insert into public.merchant_view_hours as h (merchant_id, day, hour, views) values (p_merchant_id, v_day, v_hour, 1)
    on conflict (merchant_id, day, hour) do update set views = h.views + 1;
  end if;
  if p_event = 'view' and p_source in ('map', 'list', 'search', 'offers', 'story', 'notif', 'link') then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (p_merchant_id, v_day, 'from_' || p_source, v_uid) on conflict do nothing;
  end if;
  if p_event in ('share', 'reviews', 'google', 'story_cta') then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (p_merchant_id, v_day, p_event, v_uid) on conflict do nothing;
  end if;
  if p_event in ('story', 'story_cta') and p_ref is not null
     and exists (select 1 from public.stories s where s.id = p_ref and s.merchant_id = p_merchant_id) then
    insert into public.story_viewers as v (story_id, visitor_id, clicked) values (p_ref, v_uid, p_event = 'story_cta')
    on conflict (story_id, visitor_id) do update set clicked = v.clicked or excluded.clicked;
  end if;
  if p_event = 'offer' and p_ref is not null
     and exists (select 1 from public.promotions p where p.id = p_ref and p.merchant_id = p_merchant_id) then
    insert into public.promo_clicks (promo_id, visitor_id) values (p_ref, v_uid) on conflict do nothing;
  end if;
  -- l'historique de plus de 90 jours est effacé chaque nuit par la fonction serveur « purge »
end;
$$;

-- Plus d'appel anonyme ; l'ancien compteur direct n'est plus appelable (seul track_visit s'en sert)
revoke execute on function private.track_visit(uuid, text, uuid, text), public.track_visit(uuid, text, uuid, text) from anon;
revoke execute on function private.track_merchant_event(uuid, text), public.track_merchant_event(uuid, text) from anon, authenticated;
revoke execute on function public.my_merchant_stats(integer), public.my_merchant_totals(integer) from anon;

-- -----------------------------------------------------------------------------
-- 3. Photos des fiches : uniquement celles du dossier de la fiche, sur le stockage du site
-- -----------------------------------------------------------------------------
create or replace function public.merchants_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  verified timestamptz;
  from_client boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'merchant') then
      raise exception 'Seul un compte restaurateur peut posséder une fiche.' using errcode = '42501';
    end if;
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'Le propriétaire d''une fiche ne peut pas être modifié.' using errcode = '42501';
    end if;
    if from_client and (old.status = 'suspended' or new.status = 'suspended') and new.status is distinct from old.status then
      raise exception 'Fiche suspendue : contactez la modération.' using errcode = '42501';
    end if;
  end if;

  -- Photos : adresse du stockage Supabase (ou de la copie locale de test), dossier de cette fiche, nom de fichier simple
  if from_client and new.photos_urls is distinct from (case when tg_op = 'UPDATE' then old.photos_urls end)
     and exists (select 1 from unnest(new.photos_urls) u
                 where u !~ ('^(https://[a-z0-9]{20}\.supabase\.co|http://(localhost|127\.0\.0\.1):[0-9]{2,5})/storage/v1/object/public/photos/'
                             || new.id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$')) then
    raise exception 'Photo refusée : seules les photos envoyées depuis FlashMiam sont acceptées.' using errcode = '22023';
  end if;

  if new.status = 'published' then
    -- Fiche complète (contrôlé à chaque modification d'une fiche publiée)
    if new.address is null or new.lat is null
       or char_length(new.description) < 20
       or cardinality(new.photos_urls) < 1
       or jsonb_array_length(new.opening_hours -> 'services') < 1 then
      raise exception 'Fiche incomplète : adresse, description (20 caractères), 1 photo et 1 service au minimum.' using errcode = '23514';
    end if;
    -- Mise en ligne : SIRET vérifié par le serveur, attestation sur l'honneur, abonnement actif
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      select p.siret_verified_at into verified from public.merchant_private p where p.merchant_id = new.id;
      if verified is null then
        raise exception 'SIRET non vérifié : publication impossible.' using errcode = '42501';
      end if;
      if new.honor_at is null then
        raise exception 'Attestation sur l''honneur manquante : publication impossible.' using errcode = '42501';
      end if;
      if not exists (select 1 from public.merchant_subscriptions s where s.merchant_id = new.id and s.status = 'active') then
        raise exception 'Abonnement requis : publication impossible.' using errcode = '42501';
      end if;
      new.published_at := coalesce(new.published_at, now());
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Ménage quotidien : dernier passage de la fonction serveur « purge » (un passage par heure au plus)
-- -----------------------------------------------------------------------------
create table public.maintenance_runs (
  job    text primary key check (char_length(job) between 1 and 40),
  ran_at timestamptz not null default now()
);
comment on table public.maintenance_runs is 'Dernier passage des tâches de ménage (serveur uniquement).';
revoke all on public.maintenance_runs from anon, authenticated;
grant all on public.maintenance_runs to service_role;
alter table public.maintenance_runs enable row level security;
create policy "maintenance_runs : aucun accès direct" on public.maintenance_runs
  as restrictive for all to anon, authenticated using (false) with check (false);
