-- Vérification des restaurateurs par l'équipe FlashMiam (choix A, 21 novembre 2026).
--
-- Une fiche complète, abonnée, avec SIRET vérifié et justificatifs déposés n'apparaît plus directement sur la carte :
-- elle passe en « awaiting_review » jusqu'à ce qu'un membre de l'équipe relise le Kbis et la valide. Ainsi personne ne
-- peut mettre en ligne le restaurant de quelqu'un d'autre avec son seul SIRET. Une fois validée, la fiche reste
-- validée (le restaurateur peut la masquer, la modifier, la remettre en ligne sans nouvelle vérification).
--   - merchants.approved_at / review_note : décision de l'équipe, jamais modifiables par le restaurateur ;
--   - team_review_merchant(fiche, valider, motif) : valider ou refuser (motif obligatoire, montré au restaurateur) ;
--   - team_review_queue() : les fiches qui attendent une vérification, pour le tableau de bord de l'équipe.
-- Les fiches déjà en ligne sont considérées comme validées. Les fiches de test (SIRET de test) n'en ont pas besoin.
begin;

alter table public.merchants
  add column approved_at timestamptz default now(),
  add column review_note text check (review_note is null or char_length(review_note) between 5 and 300);
-- Fiches existantes : validées (valeur par défaut ci-dessus), sauf celles qui ne sont pas en ligne
alter table public.merchants alter column approved_at drop default;
update public.merchants set approved_at = null where status <> 'published' and approved_at is not null;
comment on column public.merchants.approved_at is 'Fiche vérifiée par l''équipe (Kbis relu). Nulle : la fiche attend la vérification avant d''apparaître sur la carte.';
comment on column public.merchants.review_note is 'Motif du dernier refus par l''équipe, montré au restaurateur. Effacé à la validation.';

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

  -- Décision de l'équipe : jamais modifiable depuis le site par le restaurateur
  if from_client then
    new.approved_at := case when tg_op = 'UPDATE' then old.approved_at end;
    new.review_note := case when tg_op = 'UPDATE' then old.review_note end;
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

  if new.status in ('published', 'awaiting_docs', 'awaiting_review') then
    -- Fiche complète (contrôlé à chaque modification)
    if new.address is null or new.lat is null
       or char_length(new.description) < 20
       or cardinality(new.photos_urls) < 1
       or jsonb_array_length(new.opening_hours -> 'services') < 1 then
      raise exception 'Fiche incomplète : adresse, description (20 caractères), 1 photo et 1 service au minimum.' using errcode = '23514';
    end if;
    -- Publication : SIRET vérifié par le serveur, attestation sur l'honneur, abonnement actif
    if tg_op = 'INSERT' or old.status not in ('published', 'awaiting_docs', 'awaiting_review') then
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
    -- Sur la carte seulement avec les justificatifs obligatoires, puis la vérification de l'équipe ; sinon la fiche attend
    new.status := case
      when not private.merchant_docs_ok(new.id) then 'awaiting_docs'
      when new.approved_at is null and not new.is_test then 'awaiting_review'
      else 'published' end;
    if new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
  end if;
  return new;
end;
$$;

-- Fin d'abonnement : la fiche quitte la carte, qu'elle soit en ligne ou en attente
create or replace function private.subscription_ended()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'canceled' then
    update public.merchants set status = 'draft' where id = new.merchant_id and status in ('published', 'awaiting_docs', 'awaiting_review');
  end if;
  return null;
end;
$$;

-- Valider ou refuser une fiche (équipe uniquement). Refus : la fiche repasse en brouillon avec le motif ; le
-- restaurateur corrige (justificatif, nom…) puis la remet en ligne, ce qui la renvoie en vérification.
create function private.team_review_merchant(p_merchant_id uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_status public.merchant_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam.' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Décision manquante.' using errcode = '22023';
  end if;
  if not p_approve and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Indiquez le motif du refus (5 caractères au moins) : il sera montré au restaurateur.' using errcode = '22023';
  end if;
  if p_approve then
    update public.merchants m
       set approved_at = now(), review_note = null,
           status = case when m.status in ('awaiting_review', 'awaiting_docs') then 'published'::public.merchant_status else m.status end
     where m.id = p_merchant_id
     returning m.status into v_status;
  else
    update public.merchants m
       set approved_at = null, review_note = left(v_note, 300),
           status = case when m.status in ('published', 'awaiting_review', 'awaiting_docs') then 'draft'::public.merchant_status else m.status end
     where m.id = p_merchant_id
     returning m.status into v_status;
  end if;
  if v_status is null then
    raise exception 'Fiche introuvable.' using errcode = 'P0002';
  end if;
  return v_status::text;
end;
$$;

-- Fiches à vérifier : nom, adresse, SIRET, raison sociale, justificatifs déposés (chemins dans l'espace privé « documents »)
create function private.team_review_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'address', m.address, 'phone', m.phone, 'updated_at', m.updated_at,
      'siret', p.siret, 'legal_name', p.legal_name, 'naf_code', p.naf_code, 'siret_verified_at', p.siret_verified_at,
      'documents', (select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) from storage.objects o
                     where o.bucket_id = 'documents' and o.name like m.id::text || '/%')
    ) order by m.updated_at)
    from public.merchants m left join public.merchant_private p on p.merchant_id = m.id
    where m.status = 'awaiting_review'), '[]'::jsonb);
end;
$$;

revoke all on function private.team_review_merchant(uuid, boolean, text), private.team_review_queue() from public, anon;
grant execute on function private.team_review_merchant(uuid, boolean, text), private.team_review_queue() to authenticated;

-- Relais publics (appelés depuis le site) : les contrôles sont dans les fonctions privées
create function public.team_review_merchant(p_merchant_id uuid, p_approve boolean, p_note text default null)
returns text language sql set search_path = '' as $$ select private.team_review_merchant(p_merchant_id, p_approve, p_note) $$;
create function public.team_review_queue()
returns jsonb language sql stable set search_path = '' as $$ select private.team_review_queue() $$;
revoke all on function public.team_review_merchant(uuid, boolean, text), public.team_review_queue() from public, anon;
grant execute on function public.team_review_merchant(uuid, boolean, text), public.team_review_queue() to authenticated;

commit;
