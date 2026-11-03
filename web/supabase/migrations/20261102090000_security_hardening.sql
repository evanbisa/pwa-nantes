-- Renforcement de la sécurité (revue complète du 29 octobre 2026). Migration additive : aucune donnée supprimée.
--
--  1. Sessions qui expirent : effacées après 30 jours sans utilisation, 180 jours au plus (l'offre gratuite de Supabase
--     n'a pas ce réglage). Appelée chaque nuit par la fonction « purge ».
--  2. Jeton du ménage nocturne : seule la base (tâche planifiée) peut déclencher la fonction « purge ».
--  3. Saisies vérifiées par la base : date de fin d'une promotion (un an au plus), date de l'attestation sur l'honneur
--     et date de lecture d'une notification posées par la base (jamais par le navigateur).
--  4. Fichiers : extension vérifiée (images JPEG, PNG, WebP ; PDF pour les justificatifs) et nombre de fichiers plafonné
--     par compte, en plus de la taille maximale et des types déjà imposés par chaque espace de stockage.
--  5. Réglages de l'application (interrupteur de la confirmation par e-mail des clients), lisibles par le serveur seul.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Sessions
-- ---------------------------------------------------------------------------------------------------------------------
create function public.expire_sessions(p_idle_days integer default 30, p_max_days integer default 180)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if p_idle_days is null or p_max_days is null or p_idle_days < 1 or p_max_days < p_idle_days then
    raise exception 'Durées invalides' using errcode = '22023';
  end if;
  -- refreshed_at est enregistré par Supabase Auth sans fuseau (heure UTC) ; les jetons de la session partent avec elle
  delete from auth.sessions s
   where greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') < now() - make_interval(days => p_idle_days)
      or s.created_at < now() - make_interval(days => p_max_days);
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.expire_sessions(integer, integer) is
  'Déconnecte les sessions inutilisées depuis p_idle_days jours ou ouvertes depuis plus de p_max_days jours (ménage nocturne).';
revoke all on function public.expire_sessions(integer, integer) from public, anon, authenticated;
grant execute on function public.expire_sessions(integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Jeton du ménage nocturne (tiré au hasard ici, il ne quitte jamais la base et la fonction serveur)
-- ---------------------------------------------------------------------------------------------------------------------
create table private.app_secrets (
  name text primary key,
  value text not null check (char_length(value) >= 32),
  created_at timestamptz not null default now()
);
alter table private.app_secrets enable row level security;   -- aucune règle : fermée à tous, sauf au serveur
revoke all on private.app_secrets from public, anon, authenticated;
insert into private.app_secrets (name, value)
values ('purge_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create function public.check_cron_token(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(p_token) >= 32 and exists (
    select 1 from private.app_secrets s where s.name = 'purge_token' and s.value = p_token), false)
$$;
revoke all on function public.check_cron_token(text) from public, anon, authenticated;
grant execute on function public.check_cron_token(text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Saisies vérifiées par la base
-- ---------------------------------------------------------------------------------------------------------------------
-- Promotions : fin calculée par la base pour « jour » et « semaine », un an au plus pour les autres
create or replace function private.promotions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if new.kind = 'day' then
    new.ends_at := ((v_today + 1)::timestamp at time zone 'Europe/Paris');
  elsif new.kind = 'week' then
    new.ends_at := ((v_today + 1 + (7 - extract(isodow from v_today)::int))::timestamp at time zone 'Europe/Paris');
  elsif new.ends_at is not null and new.ends_at > now() + interval '366 days' then
    raise exception 'Une promotion dure un an au plus.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.promotions p where p.merchant_id = new.merchant_id and (p.ends_at is null or p.ends_at > now())) >= 6 then
    raise exception 'Six promotions en cours au maximum.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Fiches : la date de l'attestation sur l'honneur est celle de la base (le reste du contrôle est inchangé)
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

  -- Attestation sur l'honneur : datée par la base au moment où elle est donnée (jamais une date choisie par le navigateur)
  if from_client and new.honor_at is distinct from (case when tg_op = 'UPDATE' then old.honor_at end) then
    new.honor_at := case when new.honor_at is null then null else coalesce(case when tg_op = 'UPDATE' then old.honor_at end, now()) end;
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

-- Notifications : « lue » datée par la base, une seule fois
create function private.notifications_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and new.read_at is distinct from old.read_at then
    new.read_at := case when new.read_at is null then null else coalesce(old.read_at, now()) end;
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Fichiers : extension et nombre maximal par compte (la taille et le type sont déjà imposés par chaque espace)
-- ---------------------------------------------------------------------------------------------------------------------
create function private.storage_count(p_bucket text, p_folder text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from storage.objects o where o.bucket_id = p_bucket and starts_with(o.name, p_folder || '/')
$$;
revoke all on function private.storage_count(text, text) from public, anon;
grant execute on function private.storage_count(text, text) to authenticated, service_role;

alter policy "avatars : dépôt dans son dossier" on storage.objects
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and private.storage_count('avatars', (select auth.uid())::text) < 5
  );
alter policy "photos : dépôt dans le dossier de sa fiche" on storage.objects
  with check (
    bucket_id = 'photos'
    and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and private.storage_count('photos', (storage.foldername(name))[1]) < 40
  );
alter policy "stories (fichiers) : dépôt dans le dossier de sa fiche" on storage.objects
  with check (
    bucket_id = 'stories'
    and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid)
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and private.storage_count('stories', (storage.foldername(name))[1]) < 150
  );
alter policy "documents : dépôt dans le dossier de sa fiche" on storage.objects
  with check (
    bucket_id = 'documents'
    and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid)
    and lower(storage.extension(name)) in ('pdf', 'jpg', 'jpeg', 'png')
    and private.storage_count('documents', (storage.foldername(name))[1]) < 20
  );

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Réglages de l'application (une seule ligne), lus par les fonctions serveur
-- ---------------------------------------------------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  -- Clients : compte confirmé par un code reçu par e-mail. À activer une fois l'envoi d'e-mails réglé (Resend).
  client_email_confirmation boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;   -- aucune règle : lisible par le serveur seul
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (id) values (true);
comment on table public.app_settings is 'Réglages de FlashMiam lus par les fonctions serveur (une seule ligne).';

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Fonctions à droits élevés (SECURITY DEFINER) : rangées dans le schéma « private », que l'API n'expose pas.
--    L'API ne garde que des relais sans privilège, aux mêmes noms : rien ne change pour le site.
-- ---------------------------------------------------------------------------------------------------------------------
alter function public.track_site_event(text, uuid, text, boolean) set schema private;
alter function public.team_dashboard(integer) set schema private;
alter function public.is_team_admin() set schema private;
alter function public.accept_terms(text) set schema private;

create function public.track_site_event(p_event text, p_visitor uuid, p_platform text, p_standalone boolean default false)
returns void language sql set search_path = '' as $$ select private.track_site_event(p_event, p_visitor, p_platform, p_standalone) $$;
create function public.team_dashboard(p_days integer default 30)
returns jsonb language sql set search_path = '' as $$ select private.team_dashboard(p_days) $$;
create function public.is_team_admin()
returns boolean language sql stable set search_path = '' as $$ select private.is_team_admin() $$;
create function public.accept_terms(p_version text)
returns void language sql set search_path = '' as $$ select private.accept_terms(p_version) $$;

revoke all on function public.track_site_event(text, uuid, text, boolean) from public;
grant execute on function public.track_site_event(text, uuid, text, boolean) to anon, authenticated, service_role;
revoke all on function public.team_dashboard(integer), public.is_team_admin(), public.accept_terms(text) from public, anon;
grant execute on function public.team_dashboard(integer), public.is_team_admin(), public.accept_terms(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. Comptes jamais confirmés (code reçu par e-mail jamais saisi) : supprimés au bout de 7 jours (ménage nocturne).
--    Les comptes Google et ceux déjà confirmés ne sont jamais concernés.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.purge_unconfirmed_users(p_days integer default 7)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if p_days is null or p_days < 1 then
    raise exception 'Durée invalide' using errcode = '22023';
  end if;
  delete from auth.users u where u.email_confirmed_at is null and u.created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.purge_unconfirmed_users(integer) is
  'Supprime les comptes dont l''adresse n''a jamais été confirmée après p_days jours (ménage nocturne).';
revoke all on function public.purge_unconfirmed_users(integer) from public, anon, authenticated;
grant execute on function public.purge_unconfirmed_users(integer) to service_role;
