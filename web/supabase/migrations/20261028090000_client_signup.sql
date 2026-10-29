-- =============================================================================
-- Inscription des clients sans code par e-mail (fonction serveur client-signup).
-- La fonction crée les comptes clients déjà confirmés, après avoir vérifié l'adresse autrement (domaine capable
-- de recevoir des e-mails, adresse relue et confirmée par la personne). Les restaurateurs gardent le code.
-- Pour freiner les créations de comptes en masse : nombre de tentatives limité par adresse IP (enregistrée sous
-- forme d'empreinte, jamais en clair) et au total, sur une heure glissante ; lignes effacées chaque nuit.
-- Aucune donnée supprimée : une table et une fonction ajoutées.
-- =============================================================================
create table public.signup_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text not null check (length(ip_hash) between 16 and 128),
  kind       text not null check (kind in ('check', 'signup')),
  created_at timestamptz not null default now()
);
create index signup_attempts_ip_idx on public.signup_attempts (ip_hash, kind, created_at);
create index signup_attempts_created_idx on public.signup_attempts (created_at);
comment on table public.signup_attempts is 'Tentatives d''inscription client (empreinte de l''adresse IP, jamais l''adresse elle-même). Réservé au serveur ; effacé après 2 jours.';
revoke all on public.signup_attempts from anon, authenticated;
grant all on public.signup_attempts to service_role;
alter table public.signup_attempts enable row level security;
create policy "signup_attempts : aucun accès direct" on public.signup_attempts
  as restrictive for all to anon, authenticated using (false) with check (false);

-- Enregistre une tentative si les plafonds de l'heure écoulée ne sont pas atteints (vrai), sinon refuse (faux).
-- Plafonds par adresse IP assez hauts pour une salle de cours derrière une même connexion (wifi du campus).
create or replace function public.signup_attempt(p_ip_hash text, p_kind text)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_per_ip integer := case p_kind when 'signup' then 30 else 120 end;
  v_total  integer := case p_kind when 'signup' then 500 else 5000 end;
  v_ip_count integer;
  v_all_count integer;
begin
  if p_kind is null or p_kind not in ('check', 'signup') or p_ip_hash is null then
    raise exception 'signup_attempt : paramètres invalides' using errcode = '22023';
  end if;
  -- Une tentative à la fois par type : deux appels simultanés ne dépassent pas le plafond
  perform pg_advisory_xact_lock(hashtext('signup_attempt:' || p_kind));
  select count(*) into v_ip_count from public.signup_attempts a
  where a.ip_hash = p_ip_hash and a.kind = p_kind and a.created_at > now() - interval '1 hour';
  select count(*) into v_all_count from public.signup_attempts a
  where a.kind = p_kind and a.created_at > now() - interval '1 hour';
  if v_ip_count >= v_per_ip or v_all_count >= v_total then
    return false;
  end if;
  insert into public.signup_attempts (ip_hash, kind) values (p_ip_hash, p_kind);
  return true;
end;
$$;
revoke all on function public.signup_attempt(text, text) from public, anon, authenticated;
grant execute on function public.signup_attempt(text, text) to service_role;
