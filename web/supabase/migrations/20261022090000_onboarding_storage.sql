-- =============================================================================
-- Inscription des restaurateurs reliée à Supabase : attestation, abonnement, fiches de test,
-- photos des fiches (stockage public) et justificatifs (stockage privé).
-- Aucune suppression d'objet existant (migration non destructive).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. merchants : attestation sur l'honneur (restaurateur) et fiche de test (serveur uniquement)
-- -----------------------------------------------------------------------------
alter table public.merchants add column honor_at timestamptz;
alter table public.merchants add column is_test boolean not null default false;
comment on column public.merchants.is_test is 'Fiche créée avec le SIRET de test (établissement fictif) : affichée « Fiche de test ». Fixé par le serveur.';
grant update (honor_at) on public.merchants to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Abonnement du restaurateur (mode démonstration tant que le paiement Stripe n'est pas branché)
-- -----------------------------------------------------------------------------
create table public.merchant_subscriptions (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  mode        text not null default 'demo' check (mode in ('demo', 'stripe')),
  status      text not null default 'active' check (status in ('active', 'canceled')),
  started_at  timestamptz not null default now()
);
comment on table public.merchant_subscriptions is 'Abonnement du restaurateur. Démonstration : créé par le restaurateur ; Stripe : par le serveur uniquement.';

revoke all on public.merchant_subscriptions from anon, authenticated;
grant all on public.merchant_subscriptions to service_role;
grant select on public.merchant_subscriptions to authenticated;
grant insert (merchant_id) on public.merchant_subscriptions to authenticated;   -- mode « demo », statut « active » imposés
alter table public.merchant_subscriptions enable row level security;
create policy "subscriptions : lecture par le restaurateur" on public.merchant_subscriptions
  for select to authenticated using (private.is_merchant_owner(merchant_id));
create policy "subscriptions : abonnement de démonstration" on public.merchant_subscriptions
  for insert to authenticated with check (private.is_merchant_owner(merchant_id) and mode = 'demo' and status = 'active');

-- -----------------------------------------------------------------------------
-- 3. Mise en ligne : SIRET vérifié, attestation et abonnement actif (en plus d'une fiche complète)
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

-- Comptes Google : prénom repris du profil Google quand il n'est pas fourni
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, first_name, last_name, phone)
  values (
    new.id,
    -- toute autre valeur (ex. « admin ») donne un compte étudiant
    case when meta ->> 'role' = 'merchant' then 'merchant'::public.user_role else 'student'::public.user_role end,
    nullif(left(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', split_part(coalesce(meta ->> 'full_name', meta ->> 'name', ''), ' ', 1))), 60), ''),
    nullif(left(trim(meta ->> 'last_name'), 60), ''),
    case when meta ->> 'phone' ~ '^\+?[0-9 .]{10,20}$' then meta ->> 'phone' end
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Stockage : photos des fiches (public) et justificatifs (privé), dossier = identifiant de la fiche
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos', 'photos', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('documents', 'documents', false, 10 * 1024 * 1024, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "photos : dépôt dans le dossier de sa fiche" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));
create policy "photos : suppression des siennes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));

-- Supabase Storage ne supprime un fichier que si l'on peut aussi le lire (règle « select ») : sans ces règles,
-- les photos retirées d'une fiche et les images des stories expirées resteraient dans le stockage.
create policy "photos : lecture des siennes" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));
create policy "stories (fichiers) : lecture des siens" on storage.objects
  for select to authenticated
  using (bucket_id = 'stories' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));

create policy "documents : lecture des siens" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));
create policy "documents : dépôt dans le dossier de sa fiche" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));
create policy "documents : suppression des siens" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and private.is_merchant_owner(nullif((storage.foldername(name))[1], '')::uuid));
