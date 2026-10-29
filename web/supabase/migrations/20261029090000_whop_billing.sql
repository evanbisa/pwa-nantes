-- =============================================================================
-- Abonnements des restaurateurs payés sur Whop (whop.com) : trois formules (Essentiel, Premium, Sur devis),
-- au mois ou à l'année.
--  - billing_plans    : formules proposées (prix HT affichés sur le site, identifiant du tarif Whop « plan_… ») ;
--  - billing_settings : interrupteur « paiement Whop ouvert » (faux tant que le compte Whop n'est pas configuré :
--                       le site reste en mode démonstration) et identifiant du compte Whop (« biz_… ») ;
--  - merchant_subscriptions : formule, période, abonnement Whop, fin de période, résiliation programmée ;
--  - whop_events      : notifications Whop déjà traitées (une notification rejouée est ignorée).
-- Seul le serveur (fonctions whop-billing et whop-webhook) écrit l'abonnement Whop ; le restaurateur ne peut
-- plus s'offrir l'abonnement de démonstration une fois le paiement Whop ouvert.
-- Un abonnement terminé (résilié, expiré) remet la fiche en brouillon : elle disparaît de la carte.
-- Aucune donnée supprimée : tables et colonnes ajoutées, contraintes élargies, une règle d'accès remplacée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Formules (lecture publique des prix ; l'identifiant Whop n'est lu que par le serveur)
-- -----------------------------------------------------------------------------
create table public.billing_plans (
  key          text primary key check (key ~ '^[a-z0-9_]{3,40}$'),
  tier         text not null check (tier in ('essentiel', 'premium')),
  period       text not null check (period in ('month', 'year')),
  price_cents  integer not null check (price_cents between 100 and 10000000),   -- hors taxes
  whop_plan_id text unique check (whop_plan_id ~ '^plan_[A-Za-z0-9]{4,60}$'),
  unique (tier, period)
);
comment on table public.billing_plans is 'Formules d''abonnement des restaurateurs (prix HT). whop_plan_id : tarif correspondant sur Whop (serveur uniquement).';
insert into public.billing_plans (key, tier, period, price_cents) values
  ('essentiel_month', 'essentiel', 'month', 2900),
  ('essentiel_year',  'essentiel', 'year',  29000),   -- 10 mois payés pour 12 (modifiable)
  ('premium_month',   'premium',   'month', 7900),
  ('premium_year',    'premium',   'year',  79000);
revoke all on public.billing_plans from anon, authenticated;
grant all on public.billing_plans to service_role;
grant select (key, tier, period, price_cents) on public.billing_plans to anon, authenticated;
alter table public.billing_plans enable row level security;
create policy "billing_plans : lecture publique" on public.billing_plans for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- 2. Réglages du paiement (une seule ligne)
-- -----------------------------------------------------------------------------
create table public.billing_settings (
  id              boolean primary key default true check (id),
  whop_live       boolean not null default false,
  whop_account_id text check (whop_account_id ~ '^biz_[A-Za-z0-9]{4,60}$'),
  updated_at      timestamptz not null default now(),
  check (not whop_live or whop_account_id is not null)
);
comment on table public.billing_settings is 'Paiement Whop ouvert (whop_live) et compte Whop « biz_… ». Faux : mode démonstration (aucun paiement réel).';
insert into public.billing_settings default values;
revoke all on public.billing_settings from anon, authenticated;
grant all on public.billing_settings to service_role;
grant select (whop_live) on public.billing_settings to anon, authenticated;
alter table public.billing_settings enable row level security;
create policy "billing_settings : lecture publique" on public.billing_settings for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- 3. Abonnement du restaurateur : formule, période et suivi Whop
-- -----------------------------------------------------------------------------
alter table public.merchant_subscriptions drop constraint merchant_subscriptions_mode_check;
alter table public.merchant_subscriptions add constraint merchant_subscriptions_mode_check
  check (mode in ('demo', 'stripe', 'whop', 'manual'));   -- manual : formule « sur devis » saisie par l'équipe
alter table public.merchant_subscriptions drop constraint merchant_subscriptions_status_check;
alter table public.merchant_subscriptions add constraint merchant_subscriptions_status_check
  check (status in ('active', 'past_due', 'canceled'));    -- past_due : paiement refusé, Whop réessaie (fiche maintenue)
alter table public.merchant_subscriptions
  add column plan                 text check (plan in ('essentiel', 'premium', 'sur_devis')),
  add column period               text check (period in ('month', 'year')),
  add column whop_membership_id   text unique check (whop_membership_id ~ '^mem_[A-Za-z0-9]{4,60}$'),
  add column current_period_end   timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column manage_url           text check (char_length(manage_url) <= 500 and manage_url ~ '^https://[^\s"<>]+$'),
  add column updated_at           timestamptz not null default now();
comment on table public.merchant_subscriptions is 'Abonnement du restaurateur. Démonstration : créé par le restaurateur tant que le paiement Whop est fermé ; Whop : par le serveur uniquement.';
comment on column public.merchant_subscriptions.manage_url is 'Page Whop où le restaurateur gère son moyen de paiement et ses factures.';

-- Démonstration : formule au choix (Essentiel ou Premium), uniquement tant que le paiement Whop n'est pas ouvert
grant insert (merchant_id, plan, period) on public.merchant_subscriptions to authenticated;
drop policy "subscriptions : abonnement de démonstration" on public.merchant_subscriptions;
create policy "subscriptions : abonnement de démonstration" on public.merchant_subscriptions
  for insert to authenticated with check (
    private.is_merchant_owner(merchant_id) and mode = 'demo' and status = 'active'
    and (plan is null or plan in ('essentiel', 'premium'))
    and not exists (select 1 from public.billing_settings b where b.whop_live));

-- Abonnement terminé : la fiche publiée repasse en brouillon (le restaurateur la republie après un nouvel abonnement)
create or replace function private.subscription_ended()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'canceled' then
    update public.merchants set status = 'draft' where id = new.merchant_id and status = 'published';
  end if;
  return null;
end;
$$;
revoke all on function private.subscription_ended() from public, anon, authenticated;
create trigger merchant_subscriptions_ended
  after insert or update of status on public.merchant_subscriptions
  for each row execute function private.subscription_ended();

-- -----------------------------------------------------------------------------
-- 4. Notifications Whop déjà traitées (anti-rejeu ; effacées après 30 jours par la fonction « purge »)
-- -----------------------------------------------------------------------------
create table public.whop_events (
  id          text primary key check (char_length(id) between 1 and 120),
  type        text not null check (char_length(type) between 1 and 80),
  received_at timestamptz not null default now()
);
create index whop_events_received_idx on public.whop_events (received_at);
comment on table public.whop_events is 'Notifications Whop reçues (identifiant et type seulement). Réservé au serveur ; effacé après 30 jours.';
revoke all on public.whop_events from anon, authenticated;
grant all on public.whop_events to service_role;
alter table public.whop_events enable row level security;
create policy "whop_events : aucun accès direct" on public.whop_events
  as restrictive for all to anon, authenticated using (false) with check (false);
