-- Revenus de FlashMiam (onglet « Revenus » du tableau de bord de l'équipe) :
--  1. billing_payments : chaque paiement reçu par Whop (montant, remboursement, date, restaurant, formule), écrit par
--     la fonction serveur whop-webhook (paiement relu chez Whop, jamais d'après le contenu de la notification).
--     Pièce comptable : gardée 10 ans ; reste après la suppression du compte (restaurant détaché).
--  2. team_revenue() : encaissé (aujourd'hui, 7 jours, ce mois, mois dernier, année), par jour et par mois, état du
--     branchement Whop, prix des formules et abonnements en cours (payés et gratuits), pour calculer le revenu
--     récurrent et la prévision du mois prochain. Réservé à l'équipe.
-- Migration additive.
begin;

create table public.billing_payments (
  id             text primary key check (id ~ '^pay_[A-Za-z0-9]{4,60}$'),
  merchant_id    uuid references public.merchants (id) on delete set null,
  membership_id  text check (membership_id ~ '^mem_[A-Za-z0-9]{4,60}$'),
  plan           text check (plan in ('essentiel', 'premium', 'sur_devis')),
  period         text check (period in ('month', 'year')),
  amount_cents   integer not null check (amount_cents between 0 and 100000000),   -- montant payé (Whop)
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  currency       text not null check (currency ~ '^[a-z]{3}$'),
  billing_reason text check (char_length(billing_reason) <= 40),
  paid_at        timestamptz not null,
  updated_at     timestamptz not null default now()
);
create index billing_payments_paid_idx on public.billing_payments (paid_at);
create index billing_payments_merchant_idx on public.billing_payments (merchant_id);
comment on table public.billing_payments is 'Paiements reçus par Whop (écrits par whop-webhook). Pièces comptables : 10 ans. Jamais lisible depuis le site.';
revoke all on public.billing_payments from anon, authenticated;
grant all on public.billing_payments to service_role;
alter table public.billing_payments enable row level security;
create policy "billing_payments : aucun accès direct" on public.billing_payments for all to anon, authenticated using (false) with check (false);

create function private.team_revenue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  local_now   timestamp := now() at time zone 'Europe/Paris';
  today       date := local_now::date;
  month_start timestamptz := date_trunc('month', local_now) at time zone 'Europe/Paris';
  prev_month  timestamptz := (date_trunc('month', local_now) - interval '1 month') at time zone 'Europe/Paris';
  -- Même moment du mois dernier (le 21 à 15 h → le 21 du mois dernier à 15 h, ou sa fin s'il est plus court)
  prev_point  timestamptz := least((local_now - interval '1 month'), date_trunc('month', local_now) - interval '1 microsecond') at time zone 'Europe/Paris';
  year_start  timestamptz := date_trunc('year', local_now) at time zone 'Europe/Paris';
begin
  if not private.is_team_admin() then
    raise exception 'Réservé à l''équipe FlashMiam' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'setup', jsonb_build_object(
      'whop_live',     coalesce((select whop_live from public.billing_settings limit 1), false),
      'account_set',   coalesce((select whop_account_id is not null from public.billing_settings limit 1), false),
      'plans_total',   (select count(*) from public.billing_plans),
      'plans_linked',  (select count(*) from public.billing_plans where whop_plan_id is not null),
      'last_event',    (select max(received_at) from public.whop_events),
      'payments',      (select count(*) from public.billing_payments),
      'last_payment',  (select max(paid_at) from public.billing_payments)
    ),
    'prices', (select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'period', period, 'price_cents', price_cents) order by tier, period), '[]'::jsonb)
               from public.billing_plans),

    -- Encaissé (euros, remboursements déduits)
    'collected', (
      select jsonb_build_object(
        'today',       coalesce(sum(net) filter (where (paid_at at time zone 'Europe/Paris')::date = today), 0),
        'last_7d',     coalesce(sum(net) filter (where paid_at > now() - interval '7 days'), 0),
        'prev_7d',     coalesce(sum(net) filter (where paid_at > now() - interval '14 days' and paid_at <= now() - interval '7 days'), 0),
        'this_month',  coalesce(sum(net) filter (where paid_at >= month_start), 0),
        'last_month',  coalesce(sum(net) filter (where paid_at >= prev_month and paid_at < month_start), 0),
        'last_month_to_date', coalesce(sum(net) filter (where paid_at >= prev_month and paid_at <= prev_point), 0),
        'this_year',   coalesce(sum(net) filter (where paid_at >= year_start), 0),
        'all_time',    coalesce(sum(net), 0),
        'payments_this_month', count(*) filter (where paid_at >= month_start),
        'refunds_this_month',  coalesce(sum(refunded_cents) filter (where paid_at >= month_start), 0)
      )
      from (select paid_at, refunded_cents, amount_cents - refunded_cents as net from public.billing_payments where currency = 'eur') p
    ),
    'other_currencies', (select count(*) from public.billing_payments where currency <> 'eur'),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', g.d::date, 'cents', coalesce((
               select sum(p.amount_cents - p.refunded_cents) from public.billing_payments p
               where p.currency = 'eur' and (p.paid_at at time zone 'Europe/Paris')::date = g.d::date), 0)) order by g.d)
      from generate_series(today - 29, today, interval '1 day') as g(d)
    ),
    'monthly', (
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM-DD'), 'cents', coalesce((
               select sum(p.amount_cents - p.refunded_cents) from public.billing_payments p
               where p.currency = 'eur' and p.paid_at >= (g.m at time zone 'Europe/Paris')
                 and p.paid_at < ((g.m + interval '1 month') at time zone 'Europe/Paris')), 0)) order by g.m)
      from generate_series(date_trunc('month', local_now) - interval '11 months', date_trunc('month', local_now), interval '1 month') as g(m)
    ),

    -- Abonnements en cours (hors fiches de test) : payés (Whop, sur devis) et gratuits (démonstration)
    'subscriptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'merchant_id', m.id, 'name', m.name, 'status', s.status, 'mode', s.mode,
               'plan', s.plan, 'period', s.period, 'started_at', s.started_at,
               'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
               'merchant_status', m.status) order by s.mode, m.name), '[]'::jsonb)
      from public.merchant_subscriptions s join public.merchants m on m.id = s.merchant_id
      where s.status in ('active', 'past_due') and not m.is_test
    ),
    -- Restaurants inscrits sans abonnement (pas encore de formule choisie)
    'without_subscription', (
      select count(*) from public.merchants m
      where not m.is_test and not exists (select 1 from public.merchant_subscriptions s where s.merchant_id = m.id and s.status in ('active', 'past_due'))
    ),
    'recent_payments', (
      select coalesce(jsonb_agg(x order by x.paid_at desc), '[]'::jsonb) from (
        select p.id, p.paid_at, p.amount_cents, p.refunded_cents, p.currency, p.plan, p.period, p.billing_reason, m.name as merchant, p.merchant_id
        from public.billing_payments p left join public.merchants m on m.id = p.merchant_id
        order by p.paid_at desc limit 15) x
    )
  );
end $$;
revoke all on function private.team_revenue() from public, anon;
grant execute on function private.team_revenue() to authenticated, service_role;

create function public.team_revenue() returns jsonb
language sql stable set search_path = '' as $$ select private.team_revenue() $$;
revoke all on function public.team_revenue() from public, anon;
grant execute on function public.team_revenue() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
