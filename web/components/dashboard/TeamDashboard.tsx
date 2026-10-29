"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";

/**
 * Tableau de bord de l'équipe FlashMiam : comptes, visites du site (avec accord), écran d'accueil, restaurants,
 * abonnements, utilisation des fiches, audience. Chiffres calculés par la base (team_dashboard), réservés aux
 * comptes de l'équipe : la page n'affiche rien d'autre que ce que la base accepte de donner.
 */

type Day = { day: string };
type Data = {
  generated_at: string; days: number; since: string;
  accounts: { clients: number; merchants: number; new_period: number; new_7d: number; google: number; push_devices: number };
  signups_daily: (Day & { clients: number; merchants: number })[];
  visits_daily: (Day & { visitors: number; app: number })[];
  visits: { visitors: number; visits: number; signed_in: number; app: number; ios: number; android: number; desktop: number };
  install: { shown: number; accepted: number; installed: number };
  restaurants: { published: number; other: number; test: number };
  subscriptions: { active: number; paid: number; demo: number; mrr_cents: number };
  engagement: { views: number; directions: number; calls: number; menus: number; stories: number; follows: number; reviews: number; rating: number | null; promo_clicks: number };
  top_merchants: { name: string; is_test: boolean; views: number; followers: number }[];
  audience: { female: number; male: number; other: number; unknown: number; ages: Record<string, number> };
};
type State = { status: "loading" } | { status: "signed-out" } | { status: "forbidden" } | { status: "error"; message: string } | { status: "ready"; data: Data };

const PERIODS = [7, 30, 90] as const;
const MAP = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/../`;
const nf = new Intl.NumberFormat("fr-FR");
const n = (v: number | null | undefined) => nf.format(v ?? 0);
const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const dayLabel = (iso: string, long = false) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" });

const noSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export default function TeamDashboard() {
  return useHydrated() ? <Dashboard /> : <Shell><Centered><Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-label="Chargement" /></Centered></Shell>;
}

function Dashboard() {
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (period: number) => {
    const sb = siteClient();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) return setState({ status: "signed-out" });
    setRefreshing(true);
    const { data, error } = await sb.rpc("team_dashboard", { p_days: period });
    setRefreshing(false);
    if (error) {
      if (error.code === "42501") return setState({ status: "forbidden" });
      return setState({ status: "error", message: "Chiffres indisponibles pour le moment. Vérifiez votre connexion, puis réessayez." });
    }
    setState({ status: "ready", data: data as unknown as Data });
  }, []);

  // Chargement au changement de période (les mises à jour d'état arrivent après la réponse du serveur)
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) void load(days); });
    return () => { alive = false; };
  }, [days, load]);

  if (state.status === "loading") return <Shell><Centered><Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-label="Chargement" /></Centered></Shell>;
  if (state.status === "signed-out") return (
    <Shell><Notice title="Connectez-vous d'abord" text="Le tableau de bord s'ouvre avec le compte FlashMiam d'un membre de l'équipe." action={<a href={MAP} className="btn-dash">Se connecter sur la carte</a>} /></Shell>
  );
  if (state.status === "forbidden") return (
    <Shell><Notice title="Accès réservé à l'équipe" text="Ce compte n'a pas accès au tableau de bord de FlashMiam." action={<a href={MAP} className="btn-dash">Retour à la carte</a>} /></Shell>
  );
  if (state.status === "error") return (
    <Shell><Notice title="Oups" text={state.message} action={<button type="button" className="btn-dash" onClick={() => load(days)}>Réessayer</button>} /></Shell>
  );

  const d = state.data;
  const v = d.visits;
  const platformTotal = v.ios + v.android + v.desktop;
  return (
    <Shell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href={MAP} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Carte
          </a>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Du {dayLabel(d.since)} à aujourd&apos;hui · mis à jour à {new Date(d.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {/* Filtres : une seule rangée, au-dessus de tous les graphiques */}
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Période" className="flex rounded-full bg-slate-200/70 p-1 dark:bg-white/[0.06]">
            {PERIODS.map((p) => (
              <button
                key={p} type="button" role="radio" aria-checked={days === p} onClick={() => setDays(p)}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-600 transition aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm dark:text-zinc-400 dark:aria-checked:bg-white/15 dark:aria-checked:text-white"
              >
                {p} j
              </button>
            ))}
          </div>
          <button type="button" onClick={() => load(days)} aria-label="Actualiser" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      </header>

      {/* Chiffres clés */}
      <section aria-label="Chiffres clés" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Visiteurs (${d.days} j)`} value={n(v.visitors)} note={`${n(v.visits)} visites · ${n(v.signed_in)} connectés`} />
        <Tile label="Comptes clients" value={n(d.accounts.clients)} note={`+${n(d.accounts.new_7d)} cette semaine · ${n(d.accounts.google)} avec Google`} />
        <Tile label="Restaurants en ligne" value={n(d.restaurants.published)} note={`${n(d.accounts.merchants)} compte(s) restaurateur · ${n(d.restaurants.other)} en préparation`} />
        <Tile label="Revenu mensuel (HT)" value={euros(d.subscriptions.mrr_cents)} note={`${n(d.subscriptions.paid)} abonnement(s) payé(s) · ${n(d.subscriptions.demo)} en démo`} />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Visiteurs par jour" hint="Appareils différents, avec l'accord « statistiques » des cookies.">
          <Bars
            days={d.visits_daily.map((x) => x.day)}
            series={[{ name: "Visiteurs", color: "var(--viz-1)", values: d.visits_daily.map((x) => x.visitors) }]}
            extra={(i) => `dont ${n(d.visits_daily[i].app)} depuis l'icône`}
          />
        </Card>
        <Card title="Nouveaux comptes par jour">
          <Bars
            days={d.signups_daily.map((x) => x.day)}
            series={[
              { name: "Clients", color: "var(--viz-1)", values: d.signups_daily.map((x) => x.clients) },
              { name: "Restaurateurs", color: "var(--viz-2)", values: d.signups_daily.map((x) => x.merchants) },
            ]}
          />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Appareils" hint={`${n(platformTotal)} visiteurs sur la période`}>
          <HBars total={platformTotal} rows={[["iPhone, iPad", v.ios], ["Android", v.android], ["Ordinateur", v.desktop]]} />
        </Card>
        <Card title="Écran d'accueil" hint={`${n(v.app)} visiteur(s) ont ouvert FlashMiam depuis l'icône`}>
          <HBars total={Math.max(d.install.shown, 1)} rows={[["Proposé", d.install.shown], ["Accepté (Android)", d.install.accepted], ["Installé", d.install.installed]]} />
        </Card>
        <Card title="Alertes et avis">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Kv k="Appareils avec alertes" v={n(d.accounts.push_devices)} />
            <Kv k="Avis publiés" v={n(d.engagement.reviews)} />
            <Kv k="Note moyenne" v={d.engagement.rating ? `${String(d.engagement.rating).replace(".", ",")} / 5` : "—"} />
            <Kv k="Abonnés (suivis)" v={n(d.engagement.follows)} />
          </dl>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title={`Utilisation des fiches (${d.days} j)`}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Kv k="Fiches vues" v={n(d.engagement.views)} />
            <Kv k="Itinéraires" v={n(d.engagement.directions)} />
            <Kv k="Appels" v={n(d.engagement.calls)} />
            <Kv k="Menus ouverts" v={n(d.engagement.menus)} />
            <Kv k="Stories vues" v={n(d.engagement.stories)} />
            <Kv k="Offres ouvertes" v={n(d.engagement.promo_clicks)} />
          </dl>
          <h3 className="mt-6 text-sm font-semibold">Restaurants les plus vus</h3>
          {d.top_merchants.length ? (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400"><th className="py-1.5 font-medium">Restaurant</th><th className="py-1.5 text-right font-medium">Vues</th><th className="py-1.5 text-right font-medium">Abonnés</th></tr></thead>
              <tbody>
                {d.top_merchants.map((m) => (
                  <tr key={m.name} className="border-t border-slate-200 dark:border-white/10">
                    <td className="py-2">{m.name}{m.is_test && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-white/10 dark:text-zinc-300">test</span>}</td>
                    <td className="py-2 text-right tabular-nums">{n(m.views)}</td>
                    <td className="py-2 text-right tabular-nums">{n(m.followers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Aucun restaurant en ligne pour l&apos;instant.</p>}
        </Card>
        <Card title="Clients" hint="Réponses facultatives à l'inscription.">
          <h3 className="text-xs font-medium text-slate-600 dark:text-zinc-400">Sexe</h3>
          <HBars total={d.accounts.clients} rows={[["Femmes", d.audience.female], ["Hommes", d.audience.male], ["Autre", d.audience.other], ["Non précisé", d.audience.unknown]]} />
          <h3 className="mt-5 text-xs font-medium text-slate-600 dark:text-zinc-400">Âge</h3>
          <HBars total={d.accounts.clients} rows={[["15-17 ans", d.audience.ages["15-17"]], ["18-24 ans", d.audience.ages["18-24"]], ["25-34 ans", d.audience.ages["25-34"]], ["35 ans et plus", d.audience.ages["35+"]], ["Non précisé", d.audience.ages.unknown]]} />
        </Card>
      </div>

      <p className="mt-6 pb-4 text-center text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
        Visites comptées seulement avec l&apos;accord « statistiques » (identifiant d&apos;appareil tiré au hasard, gardé 13 mois). Les restaurateurs ne voient que leurs propres totaux.
      </p>
    </Shell>
  );
}

/* ---------- Mise en page ---------- */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="dash min-h-full bg-slate-50 text-slate-900 antialiased dark:bg-night dark:text-zinc-50 dark:[color-scheme:dark]">
      <main className="mx-auto w-full max-w-6xl px-4 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">{children}</main>
    </div>
  );
}
const Centered = ({ children }: { children: ReactNode }) => <div className="grid min-h-[60vh] place-items-center">{children}</div>;
function Notice({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <Centered>
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-slate-600 dark:text-zinc-400">{text}</p>
        <div className="mt-6">{action}</div>
      </div>
    </Centered>
  );
}
function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
      <p className="text-xs font-medium text-slate-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-[28px] leading-tight font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">{note}</p>
    </div>
  );
}
const Kv = ({ k, v }: { k: string; v: string }) => (
  <div><dt className="text-xs text-slate-600 dark:text-zinc-400">{k}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}</dd></div>
);

/* ---------- Graphiques ---------- */

type Series = { name: string; color: string; values: number[] };

/**
 * Barres par jour (empilées s'il y a plusieurs séries) : une seule échelle, grille discrète, barres fines aux coins
 * arrondis côté valeur, 2 px d'écart. Survol ou toucher : détail du jour. Légende dès 2 séries ; tableau des chiffres.
 */
function Bars({ days, series, extra }: { days: string[]; series: Series[]; extra?: (i: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = days.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(1, ...totals);
  const top = Math.max(2, niceMax(max));
  const ticks = top % 2 === 0 ? [0, top / 2, top] : [0, top];
  const sum = totals.reduce((a, b) => a + b, 0);
  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-5 flex flex-wrap gap-4 text-xs text-slate-700 dark:text-zinc-300">
          {series.map((s) => <li key={s.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name} · {n(s.values.reduce((a, b) => a + b, 0))}</li>)}
        </ul>
      )}
      {series.length === 1 && <p className="mb-5 text-xs text-slate-600 dark:text-zinc-400">Total : <b className="font-semibold text-slate-900 dark:text-zinc-50">{n(sum)}</b></p>}
      <div className="relative h-40 pl-8" onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => (
          <div key={t} className="pointer-events-none absolute inset-x-0 flex h-0 items-center" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="w-7 pr-1 text-right text-[10px] tabular-nums text-slate-500 dark:text-zinc-400">{n(t)}</span>
            <span className="h-px flex-1 bg-[var(--viz-grid)]" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-8 flex items-end gap-[2px]">
          {days.map((day, i) => (
            <button
              key={day} type="button" aria-label={`${dayLabel(day, true)} : ${series.map((s) => `${s.name} ${s.values[i]}`).join(", ")}`}
              onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
              className="relative flex h-full min-w-0 flex-1 flex-col-reverse justify-start rounded-t outline-none focus-visible:ring-2 focus-visible:ring-[var(--viz-1)]"
            >
              {/* Segments du bas vers le haut ; 2 px de fond entre deux segments ; coins arrondis seulement en haut */}
              {series.map((s, k) => {
                const h = (s.values[i] / top) * 100;
                const last = series.slice(k + 1).every((o) => !o.values[i]);
                return h > 0 ? <span key={s.name} className={`block w-full ${last ? "rounded-t" : ""} ${k > 0 ? "border-b-2 border-[var(--dash-surface)]" : ""} ${active === null || active === i ? "" : "opacity-60"}`} style={{ height: `${h}%`, background: s.color }} /> : null;
              })}
            </button>
          ))}
        </div>
        {active !== null && (
          <div role="status" className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
            style={{ left: `calc(2rem + (100% - 2rem) * ${(active + 0.5) / days.length})` }}>
            <p className="font-semibold">{dayLabel(days[active], true)}</p>
            {series.map((s) => <p key={s.name}>{s.name} : {n(s.values[active])}</p>)}
            {extra && <p className="opacity-80">{extra(active)}</p>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between pl-8 text-[10px] text-slate-500 dark:text-zinc-400">
        <span>{dayLabel(days[0])}</span><span>{dayLabel(days[Math.floor(days.length / 2)])}</span><span>{dayLabel(days[days.length - 1])}</span>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-600 dark:text-zinc-400">Voir les chiffres</summary>
        <table className="mt-2 w-full">
          <thead><tr className="text-left text-slate-600 dark:text-zinc-400"><th className="py-1 font-medium">Jour</th>{series.map((s) => <th key={s.name} className="py-1 text-right font-medium">{s.name}</th>)}</tr></thead>
          <tbody>{days.map((day, i) => <tr key={day} className="border-t border-slate-200 dark:border-white/10"><td className="py-1">{dayLabel(day)}</td>{series.map((s) => <td key={s.name} className="py-1 text-right tabular-nums">{n(s.values[i])}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

/** Barres horizontales d'une seule série : part de chaque ligne dans le total, valeur et pourcentage écrits. */
function HBars({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <ul className="mt-2 grid gap-2.5">
      {rows.map(([label, value]) => (
        <li key={label} className="text-sm">
          <div className="flex justify-between gap-3"><span>{label}</span><span className="tabular-nums text-slate-600 dark:text-zinc-400">{n(value)} · {pct(value, total)} %</span></div>
          <div className="mt-1 h-2 rounded-full bg-[var(--viz-grid)]"><div className="h-full rounded-full" style={{ width: `${pct(value, total)}%`, background: "var(--viz-1)" }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Haut de l'échelle : arrondi lisible (1, 2, 5 × 10ⁿ). */
function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}
