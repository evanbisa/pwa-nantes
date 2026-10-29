-- =============================================================================
-- Roche Street Food — base de données Supabase (lancement, offre gratuite)
--
-- À exécuter UNE FOIS dans Supabase › SQL Editor (ou `supabase db push`).
--
-- Où sont les données sensibles ?
--   * Mots de passe et e-mails : dans `auth.users`, géré par Supabase Auth. Les mots de passe y
--     sont hachés (bcrypt) ; ce schéma n'est pas exposé par l'API : aucun client ne peut le lire.
--     Aucune de nos tables ne recopie l'e-mail ni le mot de passe.
--   * SIRET : dans `merchant_private`, lisible par le seul restaurateur concerné et modifiable
--     uniquement côté serveur (clé secrète). La RLS filtre des LIGNES et non des colonnes :
--     c'est pourquoi le SIRET n'est pas dans la table publique `merchants`.
--   * Profils (prénom, nom, téléphone) : visibles par leur seul propriétaire.
--
-- La clé « publishable » (ex-anon) présente dans le navigateur est publique par nature :
-- ce sont les politiques RLS ci-dessous qui protègent les données.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Types et fonctions de validation
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('student', 'merchant');
create type public.merchant_category as enum ('food_truck', 'kebab', 'burger', 'sweets', 'pizza', 'other');
-- draft : en cours d'inscription · published : visible sur la carte · suspended : retiré par la modération
create type public.merchant_status as enum ('draft', 'published', 'suspended');

-- Zone de service : La Roche-sur-Yon et sa couronne (mêmes limites que la carte)
create function public.in_service_area(lat double precision, lng double precision)
returns boolean language sql immutable set search_path = '' as $$
  select lat between 46.60 and 46.74 and lng between -1.56 and -1.30
$$;

-- La carte du restaurant : [{ "section", "name", "price", "desc" }, …] — 80 plats au plus
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

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. profiles — un profil par compte (étudiant ou restaurateur)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,  -- = id du compte Supabase Auth
  role        public.user_role not null default 'student',
  first_name  text check (char_length(first_name) between 1 and 60),
  last_name   text check (char_length(last_name) between 1 and 60),
  phone       text check (phone ~ '^\+?[0-9 .]{10,20}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Profil de chaque compte. Visible par son seul propriétaire. Pas d''e-mail ni de mot de passe ici.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription (métadonnées passées à supabase.auth.signUp)
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, first_name, last_name, phone)
  values (
    new.id,
    -- toute autre valeur (ex. « admin ») donne un compte étudiant
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
-- 2. merchants — fiche publique d'un commerce (ce qui s'affiche sur la carte)
-- -----------------------------------------------------------------------------
create table public.merchants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 80),
  category      public.merchant_category not null default 'other',
  description   text not null default '' check (char_length(description) <= 600),
  address       text check (char_length(address) <= 200),
  lat           double precision,
  lng           double precision,
  phone         text check (phone ~ '^\+?[0-9 .]{10,20}$'),          -- téléphone du commerce (public, facultatif)
  opening_hours jsonb not null default '{"services": [], "closed_on": []}' check (public.is_valid_hours(opening_hours)),
  menu_json     jsonb not null default '[]' check (public.is_valid_menu(menu_json)),
  photos_urls   text[] not null default '{}' check (cardinality(photos_urls) <= 10),
  -- Le restaurateur peut masquer temporairement sa fiche (congés, panne…) sans la dépublier
  is_open       boolean not null default true,
  status        public.merchant_status not null default 'draft',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint merchants_coords_pair check ((lat is null) = (lng is null)),
  constraint merchants_in_area check (lat is null or public.in_service_area(lat, lng))
);
comment on table public.merchants is 'Fiche publique. Lisible par tous quand publiée et ouverte ; modifiable par son seul propriétaire.';

create index merchants_visible_idx on public.merchants (category) where status = 'published' and is_open;

create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. merchant_private — données sensibles du commerce (jamais visibles des tiers)
-- -----------------------------------------------------------------------------
create table public.merchant_private (
  merchant_id        uuid primary key references public.merchants (id) on delete cascade,
  siret              char(14) not null unique check (siret ~ '^\d{14}$'),
  siret_verified_at  timestamptz,       -- renseigné par le serveur après vérification Sirene
  legal_name         text,
  naf_code           text,
  sirene_snapshot    jsonb,             -- réponse de l'API Sirene au moment de la vérification
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.merchant_private is 'SIRET et données légales. Lecture : propriétaire. Écriture : serveur uniquement (clé secrète).';

create trigger merchant_private_updated_at before update on public.merchant_private
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Règles métier
-- -----------------------------------------------------------------------------

-- Le commerce appartient-il à l'utilisateur connecté ? (security definer : rapide et sans récursion RLS)
create function public.is_merchant_owner(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchants m where m.id = p_merchant_id and m.user_id = (select auth.uid()))
$$;

-- Garde-fous : propriétaire immuable, publication seulement avec un SIRET vérifié, modération réservée au serveur
create function public.merchants_guard()
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

  if new.status = 'published' then
    -- Fiche complète (contrôlé à chaque modification d'une fiche publiée)
    if new.address is null or new.lat is null
       or char_length(new.description) < 20
       or cardinality(new.photos_urls) < 1
       or jsonb_array_length(new.opening_hours -> 'services') < 1 then
      raise exception 'Fiche incomplète : adresse, description (20 caractères), 1 photo et 1 service au minimum.' using errcode = '23514';
    end if;
    -- Mise en ligne : SIRET vérifié par le serveur
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      select p.siret_verified_at into verified from public.merchant_private p where p.merchant_id = new.id;
      if verified is null then
        raise exception 'SIRET non vérifié : publication impossible.' using errcode = '42501';
      end if;
      new.published_at := coalesce(new.published_at, now());
    end if;
  end if;
  return new;
end;
$$;

create trigger merchants_guard before insert or update on public.merchants
  for each row execute function public.merchants_guard();

-- La fiche du restaurateur connecté, quel que soit son statut (brouillon compris)
create function public.my_merchant()
returns setof public.merchants language sql stable security invoker set search_path = '' as $$
  select * from public.merchants where user_id = (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- 5. Privilèges — rien n'est accordé par défaut, tout est explicite
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.merchants, public.merchant_private from anon, authenticated;
grant all on public.profiles, public.merchants, public.merchant_private to service_role;

-- profiles : on lit et on modifie son profil, sauf le rôle (fixé à l'inscription)
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;

-- merchants : lecture publique ; le propriétaire modifie le contenu de sa fiche.
-- La création se fait côté serveur, après vérification du SIRET.
grant select on public.merchants to anon, authenticated;
grant update (name, category, description, address, lat, lng, phone, opening_hours,
              menu_json, photos_urls, is_open, status)
  on public.merchants to authenticated;

-- merchant_private : lecture par le propriétaire uniquement ; aucune écriture depuis le navigateur
grant select on public.merchant_private to authenticated;

revoke execute on function public.handle_new_user(), public.merchants_guard() from public, anon, authenticated;
revoke execute on function public.my_merchant() from public, anon;
grant execute on function public.my_merchant() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security — activée sur TOUTES les tables
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.merchants        enable row level security;
alter table public.merchant_private enable row level security;

-- profiles
create policy "profiles : lecture de son profil" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles : modification de son profil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- merchants
create policy "merchants : lecture publique des commerces en ligne" on public.merchants
  for select to anon, authenticated using (status = 'published' and is_open);
create policy "merchants : le propriétaire voit sa fiche" on public.merchants
  for select to authenticated using (user_id = (select auth.uid()));
create policy "merchants : le propriétaire modifie sa fiche" on public.merchants
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- merchant_private
create policy "merchant_private : lecture par le propriétaire" on public.merchant_private
  for select to authenticated using (public.is_merchant_owner(merchant_id));

-- -----------------------------------------------------------------------------
-- 7. Temps réel : la carte des étudiants se met à jour en direct (RLS appliquée)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.merchants;
