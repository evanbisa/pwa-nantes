"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Info, TrendingUp } from "lucide-react";
import { ago, dateTime, dayLabel, delta, euroCents, n, plural, type Revenue, type RevenueSub, type Tier } from "./data";
import { restaurantHref } from "./nav";
import { Q, useQuery } from "./store";
import { Bars, Card, Kv, Muted, Pill, SectionError, SectionSkeleton, Tile } from "./ui";

/**
 * Onglet « Revenus » :
 *  - encaissé (paiements reçus par Whop, remboursements déduits) : aujourd'hui, 7 jours, ce mois, mois dernier, année ;
 *  - revenu récurrent (HT) des abonnements payés, d'après les prix des formules ;
 *  - prévision du mois prochain : revenu récurrent payé, moins les résiliations qui tombent avant la fin du mois
 *    prochain, plus les abonnements gratuits (démonstration) convertis au taux choisi ; et les encaissements attendus.
 * Tant que Whop n'est pas branché, l'encaissé reste à 0 et un encart liste ce qu'il reste à faire.
 */

const RATE_KEY = "flashmiam:dash-conversion";
const TIER: Record<Tier, string> = { essentiel: "Essentiel", premium: "Premium", sur_devis: "Sur devis" };
const SCENARIOS = [25, 50, 75, 100];
const monthName = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long" });
const shortMonth = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { month: "short" });
const kEuros = (cents: number) => (cents >= 100000 ? `${Math.round(cents / 100000)} k€` : euroCents(cents));

function readRate() {
  try {
    const v = Number(localStorage.getItem(RATE_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 100 && localStorage.getItem(RATE_KEY) !== null ? v : 50;
  } catch { return 50; }
}

export function RevenuePanel() {
  const { data: r, error, refresh } = useQuery<Revenue>(Q.revenue<Revenue>());
  const [rate, setRateState] = useState(readRate);
  const setRate = (v: number) => {
    setRateState(v);
    try { localStorage.setItem(RATE_KEY, String(v)); } catch { /* préférence non gardée */ }
  };
  if (!r) return error ? <SectionError retry={refresh} /> : <SectionSkeleton />;

  const c = r.collected;
  const price = (tier: Tier | null, period: string | null) =>
    r.prices.find((p) => p.tier === (tier ?? "essentiel") && p.period === (period ?? "month"))?.price_cents ?? null;
  /** Montant d'un abonnement ramené au mois (formule à l'année ÷ 12) ; null pour « sur devis ». */
  const monthly = (s: RevenueSub) => {
    const p = price(s.plan, s.period);
    return p === null ? null : (s.period === "year" ? Math.round(p / 12) : p);
  };
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

  const now = new Date(r.generated_at);
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const next = monthName(nextStart);

  const paid = r.subscriptions.filter((s) => s.mode !== "demo");
  const free = r.subscriptions.filter((s) => s.mode === "demo");
  const quote = paid.filter((s) => monthly(s) === null).length;
  const pastDue = paid.filter((s) => s.status === "past_due");
  const mrr = sum(paid.map(monthly));
  const ending = paid.filter((s) => s.cancel_at_period_end && s.current_period_end && new Date(s.current_period_end) < nextEnd);
  const churn = sum(ending.map(monthly));
  const freeMrr = sum(free.map(monthly));
  const converted = Math.round(freeMrr * rate / 100);
  const forecast = mrr - churn + converted;
  // Encaissements attendus le mois prochain : renouvellements (mois : chaque mois ; année : si l'échéance tombe ce
  // mois-là) des abonnements payés non résiliés, plus le premier paiement des abonnements gratuits convertis
  const renewals = sum(paid.filter((s) => !s.cancel_at_period_end).map((s) => {
    if (s.period !== "year") return price(s.plan, s.period);
    const end = s.current_period_end ? new Date(s.current_period_end) : null;
    return end && end >= nextStart && end < nextEnd ? price(s.plan, s.period) : 0;
  }));
  const firstPayments = Math.round(sum(free.map((s) => price(s.plan, s.period))) * rate / 100);
  const cashNext = renewals + firstPayments;

  return (
    <>
      {!r.setup.whop_live && <Setup s={r.setup} />}

      <section aria-label="Encaissé" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Tile label="Encaissé ce mois-ci" value={euroCents(c.this_month)} change={delta(c.this_month, c.last_month_to_date)}
          note={`${plural(c.payments_this_month, "paiement", "paiements")}${c.refunds_this_month ? ` · ${euroCents(c.refunds_this_month)} remboursés` : ""}`} />
        <Tile label="7 derniers jours" value={euroCents(c.last_7d)} change={delta(c.last_7d, c.prev_7d)} />
        <Tile label="Aujourd'hui" value={euroCents(c.today)} />
        <Tile label="Mois dernier" value={euroCents(c.last_month)} />
        <Tile label={`Depuis le 1er janvier`} value={euroCents(c.this_year)} note={`${euroCents(c.all_time)} au total`} />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.25fr]">
        <Card title="Revenu récurrent (HT)" hint="Abonnements payés en cours, formule à l'année ramenée au mois.">
          <p className="text-[34px] leading-tight font-bold tracking-tight tabular-nums">{euroCents(mrr)}<span className="ml-1 text-base font-medium text-slate-600 dark:text-zinc-400">/ mois</span></p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Kv k="Sur un an" v={euroCents(mrr * 12)} />
            <Kv k="Abonnements payés" v={n(paid.length)} sub={quote ? `dont ${n(quote)} sur devis` : undefined} />
            <Kv k="Panier moyen" v={paid.length - quote ? euroCents(Math.round(mrr / (paid.length - quote))) : "—"} sub="/ mois" />
            <Kv k="Abonnements gratuits" v={n(free.length)} sub={`${euroCents(freeMrr)} / mois possibles`} />
          </dl>
          {pastDue.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-sm text-[#a82626] dark:text-[#ff9b9b]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {plural(pastDue.length, "paiement refusé", "paiements refusés")} : {pastDue.map((s) => s.name).join(", ")} (Whop réessaie).
            </p>
          )}
          {quote > 0 && <p className="mt-2 text-xs text-slate-600 dark:text-zinc-400">Les abonnements « sur devis » n&apos;ont pas de prix fixe : ils ne sont pas comptés dans les montants.</p>}
        </Card>

        <Card title={`Prévision pour ${next}`} hint="Si une partie des restaurants en abonnement gratuit passe à l'abonnement payant.">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-slate-600 dark:text-zinc-400">Revenu récurrent prévu (HT)</p>
              <p className="text-[34px] leading-tight font-bold tracking-tight tabular-nums">{euroCents(forecast)}<span className="ml-1 text-base font-medium text-slate-600 dark:text-zinc-400">/ mois</span></p>
              <p className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium ${forecast >= mrr ? "text-[#006300] dark:text-[#0ca30c]" : "text-[#a82626] dark:text-[#ff9b9b]"}`}>
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />{forecast >= mrr ? "+" : ""}{euroCents(forecast - mrr)} par rapport à aujourd&apos;hui
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-600 dark:text-zinc-400">Encaissements attendus en {next}</p>
              <p className="text-2xl font-bold tabular-nums">{euroCents(cashNext)}</p>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="conv" className="flex items-center justify-between text-sm">
              <span>Abonnements gratuits convertis</span>
              <b className="tabular-nums">{rate} % · {n(Math.round(free.length * rate / 100))} / {n(free.length)}</b>
            </label>
            <input id="conv" type="range" min={0} max={100} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--viz-1)]" />
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Scénarios">
              {SCENARIOS.map((x) => (
                <button key={x} type="button" onClick={() => setRate(x)} aria-pressed={rate === x}
                  className="rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-slate-300 aria-pressed:bg-slate-900 aria-pressed:text-white aria-pressed:ring-slate-900 dark:ring-white/15 dark:aria-pressed:bg-white dark:aria-pressed:text-slate-900">
                  {x} % → {euroCents(mrr - churn + Math.round(freeMrr * x / 100))}
                </button>
              ))}
            </div>
          </div>

          <table className="mt-5 w-full text-sm">
            <caption className="sr-only">Détail du calcul</caption>
            <tbody className="[&_td]:py-1.5 [&_tr]:border-t [&_tr]:border-slate-200 dark:[&_tr]:border-white/10">
              <tr><td>Revenu récurrent payé aujourd&apos;hui</td><td className="text-right tabular-nums">{euroCents(mrr)}</td></tr>
              <tr><td>Résiliations qui prennent effet d&apos;ici fin {next} <span className="text-xs text-slate-600 dark:text-zinc-400">({n(ending.length)})</span></td><td className="text-right tabular-nums">− {euroCents(churn)}</td></tr>
              <tr><td>Abonnements gratuits convertis <span className="text-xs text-slate-600 dark:text-zinc-400">({rate} % de {euroCents(freeMrr)})</span></td><td className="text-right tabular-nums">+ {euroCents(converted)}</td></tr>
              <tr className="font-semibold"><td>Prévu pour {next}</td><td className="text-right tabular-nums">{euroCents(forecast)}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 dark:text-zinc-400">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            Encaissements attendus : renouvellements des abonnements payés ({euroCents(renewals)}) et premier paiement des conversions ({euroCents(firstPayments)} ; une formule à l&apos;année est payée en une fois).
            {r.without_subscription > 0 && ` Pas comptés : ${plural(r.without_subscription, "restaurant inscrit", "restaurants inscrits")} sans formule choisie.`}
          </p>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Encaissé par mois" hint="12 derniers mois, remboursements déduits.">
          <Bars labels={r.monthly.map((x) => new Date(x.month + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))} dates={false}
            format={euroCents} tickFormat={kEuros}
            axis={[shortMonth(r.monthly[0].month), shortMonth(r.monthly[6].month), shortMonth(r.monthly[11].month)]}
            series={[{ name: "Encaissé", color: "var(--viz-1)", values: r.monthly.map((x) => x.cents) }]} />
        </Card>
        <Card title="Encaissé par jour" hint="30 derniers jours.">
          <Bars labels={r.daily.map((x) => x.day)} format={euroCents} tickFormat={kEuros}
            series={[{ name: "Encaissé", color: "var(--viz-1)", values: r.daily.map((x) => x.cents) }]} />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Abonnements gratuits" hint="Démonstration : le potentiel si chacun passe à sa formule payante.">
          {free.length ? <SubTable subs={free} monthly={monthly} free /> : <Muted>Aucun abonnement gratuit.</Muted>}
        </Card>
        <Card title="Abonnements payés">
          {paid.length ? <SubTable subs={paid} monthly={monthly} /> : <Muted>Aucun abonnement payé pour l&apos;instant.</Muted>}
        </Card>
      </div>

      <Card className="mt-3" title="Derniers paiements" hint={r.setup.last_payment ? `Dernier paiement ${ago(r.setup.last_payment)}.` : undefined}>
        {r.recent_payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400"><th className="py-1.5 font-medium">Date</th><th className="py-1.5 font-medium">Restaurant</th><th className="py-1.5 font-medium">Formule</th><th className="py-1.5 text-right font-medium">Montant</th></tr></thead>
              <tbody>
                {r.recent_payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-200 dark:border-white/10">
                    <td className="py-2 whitespace-nowrap">{dateTime(p.paid_at)}</td>
                    <td className="py-2">{p.merchant_id ? <a href={restaurantHref(p.merchant_id)} className="text-[var(--viz-1)] hover:underline">{p.merchant}</a> : <span className="text-slate-500">compte supprimé</span>}</td>
                    <td className="py-2">{p.plan ? TIER[p.plan] : "—"}{p.period && ` · ${p.period === "year" ? "an" : "mois"}`}</td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap">
                      {p.currency === "eur" ? euroCents(p.amount_cents, 2) : `${(p.amount_cents / 100).toFixed(2)} ${p.currency.toUpperCase()}`}
                      {p.refunded_cents > 0 && <span className="ml-2"><Pill tone="warning">−{euroCents(p.refunded_cents, 2)} remboursé</Pill></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Muted>Aucun paiement reçu pour l&apos;instant{r.setup.whop_live ? "." : " : le paiement Whop n'est pas encore ouvert."}</Muted>}
        {r.other_currencies > 0 && <p className="mt-3 text-xs text-slate-600 dark:text-zinc-400">{plural(r.other_currencies, "paiement", "paiements")} dans une autre monnaie que l&apos;euro, non compté(s) dans les totaux.</p>}
      </Card>
    </>
  );
}

function SubTable({ subs, monthly, free = false }: { subs: RevenueSub[]; monthly: (s: RevenueSub) => number | null; free?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400">
          <th className="py-1.5 font-medium">Restaurant</th><th className="py-1.5 font-medium">Formule</th>
          <th className="py-1.5 font-medium">{free ? "Depuis" : "Échéance"}</th><th className="py-1.5 text-right font-medium">{free ? "Potentiel" : "HT"} / mois</th>
        </tr></thead>
        <tbody>
          {subs.map((s) => {
            const m = monthly(s);
            return (
              <tr key={s.merchant_id} className="border-t border-slate-200 dark:border-white/10">
                <td className="py-2 pr-2"><a href={restaurantHref(s.merchant_id)} className="text-[var(--viz-1)] hover:underline">{s.name}</a></td>
                <td className="py-2 pr-2">
                  {s.plan ? TIER[s.plan] : "Essentiel (par défaut)"}{s.period === "year" ? " · an" : " · mois"}
                  {s.status === "past_due" && <span className="ml-1.5"><Pill tone="critical">paiement refusé</Pill></span>}
                  {s.cancel_at_period_end && <span className="ml-1.5"><Pill tone="warning">résilié</Pill></span>}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap">{free ? dayLabel(s.started_at) : s.current_period_end ? dayLabel(s.current_period_end) : "—"}</td>
                <td className="py-2 text-right tabular-nums">{m === null ? "sur devis" : euroCents(m)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Branchement de Whop : ce qui est fait, ce qu'il reste à faire (README de web/, « Paiement des abonnements »). */
function Setup({ s }: { s: Revenue["setup"] }) {
  const steps: [boolean, string][] = [
    [s.account_set, "Compte Whop relié (identifiant « biz_… » dans billing_settings)"],
    [s.plans_linked === s.plans_total && s.plans_total > 0, `Tarifs Whop reliés aux formules (${n(s.plans_linked)} / ${n(s.plans_total)})`],
    [!!s.last_event, `Notifications de Whop reçues${s.last_event ? ` (dernière ${ago(s.last_event)})` : ""}`],
    [s.whop_live, "Paiement ouvert (billing_settings.whop_live)"],
    [s.payments > 0, `Premier paiement enregistré${s.payments ? ` (${n(s.payments)})` : ""}`],
  ];
  return (
    <section aria-label="Branchement de Whop" className="mb-3 rounded-2xl bg-[var(--viz-1)]/[0.07] p-5 ring-1 ring-[var(--viz-1)]/25">
      <h2 className="text-[15px] font-semibold">Whop n&apos;est pas encore branché : paiements en mode démonstration</h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-zinc-300">
        L&apos;encaissé restera à 0 € jusqu&apos;au premier paiement réel. Le revenu récurrent et la prévision sont déjà calculés d&apos;après les formules choisies.
      </p>
      <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {steps.map(([ok, label]) => (
          <li key={label} className="flex items-start gap-2">
            {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0ca30c]" aria-label="fait" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="à faire" />}
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-600 dark:text-zinc-400">Étapes détaillées : web/README.md, « Paiement des abonnements : Whop ». La fonction serveur whop-webhook doit être republiée pour enregistrer les paiements.</p>
    </section>
  );
}
