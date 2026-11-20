-- Justificatifs facultatifs à l'inscription, obligatoires pour apparaître sur la carte.
--
-- Une fiche complète et abonnée que le restaurateur publie sans ses justificatifs passe en « awaiting_docs » au lieu
-- d'être refusée : elle reste invisible (toutes les règles d'accès et fonctions publiques ne montrent que « published »).
-- Dès que le Kbis et l'attestation d'hygiène sont dans l'espace « documents » de la fiche, la mise en ligne réussit.

-- Justificatifs obligatoires déposés (fichiers « kbis--… » et « hygiene--… » dans le dossier de la fiche)
create or replace function private.merchant_docs_ok(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name like p_merchant_id::text || '/kbis--%')
     and exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name like p_merchant_id::text || '/hygiene--%')
$$;
revoke all on function private.merchant_docs_ok(uuid) from public, anon;
grant execute on function private.merchant_docs_ok(uuid) to authenticated, service_role;

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

  if new.status in ('published', 'awaiting_docs') then
    -- Fiche complète (contrôlé à chaque modification)
    if new.address is null or new.lat is null
       or char_length(new.description) < 20
       or cardinality(new.photos_urls) < 1
       or jsonb_array_length(new.opening_hours -> 'services') < 1 then
      raise exception 'Fiche incomplète : adresse, description (20 caractères), 1 photo et 1 service au minimum.' using errcode = '23514';
    end if;
    -- Publication : SIRET vérifié par le serveur, attestation sur l'honneur, abonnement actif
    if tg_op = 'INSERT' or old.status not in ('published', 'awaiting_docs') then
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
    end if;
    -- Sur la carte seulement avec les justificatifs obligatoires ; sinon la fiche attend, sans erreur
    new.status := case when private.merchant_docs_ok(new.id) then 'published' else 'awaiting_docs' end;
    if new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
  end if;
  return new;
end;
$$;

-- Fin d'abonnement : la fiche quitte la carte, qu'elle soit en ligne ou en attente des justificatifs
create or replace function private.subscription_ended()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'canceled' then
    update public.merchants set status = 'draft' where id = new.merchant_id and status in ('published', 'awaiting_docs');
  end if;
  return null;
end;
$$;
