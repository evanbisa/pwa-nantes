-- =============================================================================
-- Roche Street Food — schéma initial Supabase
-- Tables, sécurité au niveau des lignes (RLS), stockage des fichiers.
--
-- Principes de sécurité :
--   * RLS filtre des LIGNES, pas des colonnes. Les données sensibles (SIRET, Stripe,
--     justificatifs) vivent donc dans une table à part, `merchant_private`, lisible
--     uniquement par son propriétaire et modifiable uniquement par le serveur.
--   * Le SIRET et l'abonnement ne sont jamais écrits par le navigateur : ce sont les
--     routes serveur (vérification Sirene, webhook Stripe) qui les écrivent avec la clé
--     `service_role`. Un commerçant ne peut donc ni inventer un SIRET ni se déclarer abonné.
--   * Les privilèges sont accordés explicitement, colonne par colonne quand c'est utile,
--     en plus des politiques RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Types
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('student', 'merchant');
create type public.merchant_category as enum ('food_truck', 'kebab', 'burger', 'sweets', 'pizza', 'other');
-- draft : en cours d'inscription · published : visible sur la carte · suspended : retiré par la modération
create type public.merchant_status as enum ('draft', 'published', 'suspended');
-- Statuts d'abonnement Stripe (+ « none » tant qu'aucun abonnement n'existe)
create type public.subscription_status as enum (
  'none', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
);

-- Zone autorisée : La Roche-sur-Yon et sa couronne (mêmes limites que la carte)
create function public.in_service_area(lat double precision, lng double precision)
returns boolean language sql immutable set search_path = '' as $$
  select lat between 46.60 and 46.74 and lng between -1.56 and -1.30
$$;

-- Validation de la carte du restaurant : [{ "section", "name", "price", "desc" }, …] (80 plats au plus)
create function public.is_valid_menu(menu jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(menu) = 'array'
     and jsonb_array_length(menu) <= 80
     and not exists (
       select 1 from jsonb_array_elements(menu) as item
       where jsonb_typeof(item) <> 'object'
          or jsonb_typeof(item -> 'name') is distinct from 'string'
          or char_length(item ->> 'name') not between 2 and 60
          or jsonb_typeof(item -> 'price') is distinct from 'number'
          or (item ->> 'price')::numeric not between 0 and 999.99
          or char_length(coalesce(item ->> 'section', '')) > 30
          or char_length(coalesce(item ->> 'desc', '')) > 120
     )
$$;

-- Horaires : { "services": [["11:30","14:30"], …] (2 au plus), "closed_on": [0-6, …] }
create function public.is_valid_hours(hours jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(hours) = 'object'
     and jsonb_typeof(hours -> 'services') = 'array'
     and jsonb_array_length(hours -> 'services') <= 2
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
$$;

-- Horodatage « updated_at »
create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Profils (un par compte Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,  -- = id de l'utilisateur
  role        public.user_role not null default 'student',
  first_name  text check (char_length(first_name) between 1 and 60),
  last_name   text check (char_length(last_name) between 1 and 60),
  phone       text check (phone ~ '^\+?[0-9 .]{10,20}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Profil applicatif de chaque compte. Le rôle est fixé à l''inscription.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription (rôle lu dans les métadonnées de signUp)
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, first_name, last_name, phone)
  values (
    new.id,
    case when meta ->> 'role' = 'merchant' then 'merchant'::public.user_role else 'student'::public.user_role end,
    nullif(left(trim(meta ->> 'first_name'), 60), ''),
    nullif(left(trim(meta ->> 'last_name'), 60), ''),
    case when meta ->> 'phone' ~ '^\+?[0-9 .]{10,20}$' then meta ->> 'phone' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Commerçants : partie publique (fiche affichée sur la carte)
-- -----------------------------------------------------------------------------
create table public.merchants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles (id) on delete cascade,
  name                text not null check (char_length(name) between 2 and 80),
  category            public.merchant_category not null default 'other',
  description         text not null default '' check (char_length(description) <= 600),
  address             text check (char_length(address) <= 200),
  lat                 double precision,
  lng                 double precision,
  phone               text check (phone ~ '^\+?[0-9 .]{10,20}$'),
  opening_hours       jsonb not null default '{"services": [], "closed_on": []}' check (public.is_valid_hours(opening_hours)),
  -- Le commerçant peut masquer temporairement sa fiche (congés, panne…) sans la dépublier
  is_open             boolean not null default true,
  photos_urls         text[] not null default '{}' check (cardinality(photos_urls) <= 10),
  menu_json           jsonb not null default '[]' check (public.is_valid_menu(menu_json)),
  status              public.merchant_status not null default 'draft',
  -- Recopié depuis merchant_private par trigger : ni lisible ni modifiable en direct ailleurs
  subscription_active boolean not null default false,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint merchants_coords_pair check ((lat is null) = (lng is null)),
  constraint merchants_in_area check (lat is null or public.in_service_area(lat, lng))
);
comment on table public.merchants is 'Fiche publique d''un commerce. Visible par tous quand publiée, ouverte et abonnée.';
comment on column public.merchants.photos_urls is 'URL publiques du bucket merchant-photos (1 à 10, format 16:9).';
comment on column public.merchants.menu_json is 'La carte : [{section, name, price, desc}] — 80 plats au plus.';

create index merchants_visible_idx on public.merchants (category)
  where status = 'published' and is_open and subscription_active;

create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Commerçants : partie privée (jamais visible des tiers)
-- -----------------------------------------------------------------------------
create table public.merchant_private (
  merchant_id                uuid primary key references public.merchants (id) on delete cascade,
  siret                      char(14) not null unique check (siret ~ '^\d{14}$'),
  siret_verified_at          timestamptz,
  legal_name                 text,
  naf_code                   text,
  sirene_snapshot            jsonb,                 -- réponse brute de l'API Sirene au moment de la vérification
  documents                  jsonb not null default '{}',  -- { "kbis": "<chemin>", "hygiene": "<chemin>" } dans merchant-documents
  honor_statement_at         timestamptz,           -- attestation sur l'honneur
  stripe_customer_id         text unique,
  stripe_subscription_id     text unique,
  stripe_subscription_status public.subscription_status not null default 'none',
  current_period_end         timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
comment on table public.merchant_private is 'SIRET, justificatifs et Stripe. Lecture : propriétaire. Écriture : serveur (service_role).';

create trigger merchant_private_updated_at before update on public.merchant_private
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Offres (promotions affichées sur la fiche)
-- -----------------------------------------------------------------------------
create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references public.merchants (id) on delete cascade,
  title          text not null check (char_length(title) between 2 and 80),
  description    text check (char_length(description) <= 200),
  price          numeric(6, 2) not null check (price >= 0),
  original_price numeric(6, 2) check (original_price is null or original_price > price),
  is_active      boolean not null default true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint offers_period check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index offers_merchant_idx on public.offers (merchant_id) where is_active;

create trigger offers_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Statistiques (une ligne par commerce et par jour)
-- -----------------------------------------------------------------------------
create table public.analytics (
  id                bigint generated always as identity primary key,
  merchant_id       uuid not null references public.merchants (id) on delete cascade,
  day               date not null default ((now() at time zone 'Europe/Paris')::date),
  view_count        integer not null default 0 check (view_count >= 0),
  route_click_count integer not null default 0 check (route_click_count >= 0),
  unique (merchant_id, day)
);

-- -----------------------------------------------------------------------------
-- 6. Fonctions d'aide et règles métier
-- -----------------------------------------------------------------------------

-- Le commerce appartient-il à l'utilisateur connecté ? (security definer : évite la
-- récursion RLS et reste rapide dans les politiques)
create function public.is_merchant_owner(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchants m where m.id = p_merchant_id and m.user_id = (select auth.uid()))
$$;

-- Le commerce est-il visible du public ?
create function public.is_merchant_visible(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id and m.status = 'published' and m.is_open and m.subscription_active
  )
$$;

-- Garde-fous sur les fiches : propriétaire immuable, publication contrôlée, modération réservée au serveur
create function public.merchants_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  priv public.merchant_private;
  from_client boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'merchant') then
      raise exception 'Seul un compte commerçant peut posséder une fiche.' using errcode = '42501';
    end if;
  else
    if new.user_id is distinct from old.user_id then
      raise exception 'Le propriétaire d''une fiche ne peut pas être modifié.' using errcode = '42501';
    end if;
    if from_client and (old.status = 'suspended' or new.status = 'suspended') and new.status is distinct from old.status then
      raise exception 'Fiche suspendue : contactez la modération.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'published' then
    -- Fiche complète (vérifié à chaque modification d'une fiche publiée)
    if new.address is null or new.lat is null
       or char_length(new.description) < 20
       or cardinality(new.photos_urls) < 1
       or jsonb_array_length(new.opening_hours -> 'services') < 1 then
      raise exception 'Fiche incomplète : adresse, description (20 caractères), 1 photo et 1 service au minimum.' using errcode = '23514';
    end if;
    -- Passage en ligne : SIRET vérifié, justificatifs fournis, abonnement actif
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      select * into priv from public.merchant_private where merchant_id = new.id;
      if priv is null or priv.siret_verified_at is null then
        raise exception 'SIRET non vérifié.' using errcode = '42501';
      end if;
      if not (priv.documents ? 'kbis' and priv.documents ? 'hygiene') or priv.honor_statement_at is null then
        raise exception 'Justificatifs ou attestation sur l''honneur manquants.' using errcode = '42501';
      end if;
      if priv.stripe_subscription_status not in ('active', 'trialing') then
        raise exception 'Abonnement inactif.' using errcode = '42501';
      end if;
      new.published_at := coalesce(new.published_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger merchants_guard before insert or update on public.merchants
  for each row execute function public.merchants_guard();

-- L'abonnement (écrit par le webhook Stripe) pilote la visibilité de la fiche
create function public.sync_subscription_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.merchants
     set subscription_active = new.stripe_subscription_status in ('active', 'trialing')
   where id = new.merchant_id
     and subscription_active is distinct from (new.stripe_subscription_status in ('active', 'trialing'));
  return new;
end;
$$;

create trigger merchant_private_sync after insert or update of stripe_subscription_status on public.merchant_private
  for each row execute function public.sync_subscription_flag();

-- Comptage des vues de fiche et des clics « Y aller » (appelable par tous, sans accès direct à la table)
create function public.track_merchant_event(p_merchant_id uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_event not in ('view', 'route_click') then
    raise exception 'Évènement inconnu : %', p_event using errcode = '22023';
  end if;
  if not public.is_merchant_visible(p_merchant_id) then
    return;
  end if;
  insert into public.analytics as a (merchant_id, view_count, route_click_count)
  values (p_merchant_id, (p_event = 'view')::int, (p_event = 'route_click')::int)
  on conflict (merchant_id, day) do update
    set view_count = a.view_count + excluded.view_count,
        route_click_count = a.route_click_count + excluded.route_click_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Privilèges (en plus de RLS) — rien n'est accordé par défaut
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.merchants, public.merchant_private, public.offers, public.analytics
  from anon, authenticated;
grant all on public.profiles, public.merchants, public.merchant_private, public.offers, public.analytics
  to service_role;

-- profiles : lecture et modification de son propre profil, sauf le rôle
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;

-- merchants : lecture publique ; le propriétaire modifie le contenu de sa fiche (pas le propriétaire,
-- ni l'abonnement, ni les dates). La création passe par la route serveur de vérification SIRET.
grant select on public.merchants to anon, authenticated;
grant update (name, category, description, address, lat, lng, phone, opening_hours,
              is_open, photos_urls, menu_json, status)
  on public.merchants to authenticated;

-- merchant_private : lecture par le propriétaire uniquement, écriture serveur uniquement
grant select on public.merchant_private to authenticated;

-- offers : lecture publique, gestion complète par le propriétaire
grant select on public.offers to anon, authenticated;
grant insert (merchant_id, title, description, price, original_price, is_active, starts_at, ends_at),
      update (title, description, price, original_price, is_active, starts_at, ends_at),
      delete
  on public.offers to authenticated;

-- analytics : lecture par le propriétaire ; écriture via track_merchant_event uniquement
grant select on public.analytics to authenticated;

revoke execute on function public.handle_new_user(), public.merchants_guard(), public.sync_subscription_flag()
  from public, anon, authenticated;
revoke execute on function public.track_merchant_event(uuid, text) from public;
grant execute on function public.track_merchant_event(uuid, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.merchants        enable row level security;
alter table public.merchant_private enable row level security;
alter table public.offers           enable row level security;
alter table public.analytics        enable row level security;

-- profiles
create policy "profiles : lecture de son profil" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles : modification de son profil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- merchants
create policy "merchants : lecture publique des commerces ouverts" on public.merchants
  for select to anon, authenticated
  using (status = 'published' and is_open and subscription_active);
create policy "merchants : le propriétaire voit sa fiche" on public.merchants
  for select to authenticated using (user_id = (select auth.uid()));
create policy "merchants : le propriétaire modifie sa fiche" on public.merchants
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- merchant_private
create policy "merchant_private : lecture par le propriétaire" on public.merchant_private
  for select to authenticated using (public.is_merchant_owner(merchant_id));

-- offers
create policy "offers : lecture publique des offres actives" on public.offers
  for select to anon, authenticated
  using (is_active
         and (starts_at is null or starts_at <= now())
         and (ends_at is null or ends_at > now())
         and public.is_merchant_visible(merchant_id));
create policy "offers : le propriétaire voit ses offres" on public.offers
  for select to authenticated using (public.is_merchant_owner(merchant_id));
create policy "offers : le propriétaire crée ses offres" on public.offers
  for insert to authenticated with check (public.is_merchant_owner(merchant_id));
create policy "offers : le propriétaire modifie ses offres" on public.offers
  for update to authenticated
  using (public.is_merchant_owner(merchant_id)) with check (public.is_merchant_owner(merchant_id));
create policy "offers : le propriétaire supprime ses offres" on public.offers
  for delete to authenticated using (public.is_merchant_owner(merchant_id));

-- analytics
create policy "analytics : lecture par le propriétaire" on public.analytics
  for select to authenticated using (public.is_merchant_owner(merchant_id));

-- -----------------------------------------------------------------------------
-- 9. Stockage des fichiers
--   merchant-photos    : public (affiché sur la carte), dossier = id de l'utilisateur
--   merchant-documents : privé (Kbis, attestation d'hygiène), dossier = id de l'utilisateur
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('merchant-photos', 'merchant-photos', true, 5242880, array['image/jpeg', 'image/webp']),
  ('merchant-documents', 'merchant-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create function public.is_merchant_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'merchant')
$$;

create policy "photos : un commerçant dépose dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'merchant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.is_merchant_account());
create policy "photos : un commerçant remplace ses photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'merchant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'merchant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos : un commerçant supprime ses photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'merchant-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "documents : un commerçant dépose ses justificatifs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'merchant-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.is_merchant_account());
create policy "documents : un commerçant consulte ses justificatifs" on storage.objects
  for select to authenticated
  using (bucket_id = 'merchant-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents : un commerçant supprime ses justificatifs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'merchant-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 10. Temps réel : les étudiants voient les fiches et offres changer en direct (RLS appliquée)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.merchants, public.offers;
