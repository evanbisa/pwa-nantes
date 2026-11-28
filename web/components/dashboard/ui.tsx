"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { dayLabel, n, pct } from "./data";

/* ---------- Mise en page ---------- */

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="dash min-h-full bg-slate-50 text-slate-900 antialiased dark:bg-night dark:text-zinc-50 dark:[color-scheme:dark]">
      <main className="mx-auto w-full max-w-6xl px-4 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">{children}</main>
    </div>
  );
}
export const Centered = ({ children }: { children: ReactNode }) => <div className="grid min-h-[60vh] place-items-center">{children}</div>;

export function Notice({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <Centered>
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-600 dark:text-zinc-400">{text}</p>
        <div className="mt-6">{action}</div>
      </div>
    </Centered>
  );
}

export function Card({ title, hint, children, className = "", action }: { title: string; hint?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-slate-600 dark:text-zinc-400">{children}</p>;

/**
 * Chiffre clé, avec son évolution par rapport à la période précédente. upIsGood = false pour les bugs : une hausse
 * s'affiche alors en rouge. Couleur toujours accompagnée d'une flèche et d'un texte.
 */
export function Tile({ label, value, note, change, upIsGood = true, href }: { label: string; value: string; note?: ReactNode; change?: number | null; upIsGood?: boolean; href?: string }) {
  const good = change != null && change !== 0 && (change > 0) === upIsGood;
  const Box = href ? "a" : "div";
  return (
    <Box href={href} className={`block min-w-0 rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10 ${href ? "transition hover:-translate-y-px hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-[var(--viz-1)] focus-visible:outline-none dark:hover:ring-white/20" : ""}`}>
      <p className="truncate text-xs font-medium text-slate-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-[28px] leading-tight font-bold tabular-nums">{value}</p>
      {change !== undefined && (
        <p className={`mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium ${change == null || change === 0 ? "text-slate-600 dark:text-zinc-400" : good ? "text-[#006300] dark:text-[#0ca30c]" : "text-[#d03b3b] dark:text-[#f06a6a]"}`}>
          {change == null ? "nouveau" : change === 0 ? "= période préc." : <>{change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}{change > 0 ? "+" : ""}{change} %<span className="font-normal text-slate-600 dark:text-zinc-400">&nbsp;vs préc.</span></>}
        </p>
      )}
      {note && <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">{note}</p>}
    </Box>
  );
}

export const Kv = ({ k, v, sub }: { k: string; v: string; sub?: string }) => (
  <div className="min-w-0">
    <dt className="text-xs text-slate-600 dark:text-zinc-400">{k}</dt>
    <dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}{sub && <span className="ml-1 text-xs font-normal text-slate-600 dark:text-zinc-400">{sub}</span>}</dd>
  </div>
);

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "critical" | "warning" | "good" | "info" }) {
  const tones = {
    neutral: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-zinc-300",
    critical: "bg-[#d03b3b]/12 text-[#a82626] dark:bg-[#d03b3b]/25 dark:text-[#ff9b9b]",
    warning: "bg-[#fab219]/20 text-[#7a5200] dark:bg-[#fab219]/20 dark:text-[#ffd27a]",
    good: "bg-[#0ca30c]/12 text-[#006300] dark:bg-[#0ca30c]/20 dark:text-[#7be07b]",
    info: "bg-[var(--viz-1)]/12 text-[#1d5aa6] dark:bg-[var(--viz-1)]/25 dark:text-[#9cc3f5]",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/* ---------- Graphiques ---------- */

type Series = { name: string; color: string; values: number[] };

/** Haut de l'échelle : arrondi lisible (1, 2, 5 × 10ⁿ). */
function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

/**
 * Barres verticales (empilées s'il y a plusieurs séries) : une seule échelle, grille discrète, 2 px d'écart, coins
 * arrondis en haut. Survol ou toucher : détail. Légende dès 2 séries ; tableau des chiffres repliable.
 * labels : jours (ISO, affichés en date) ou libellés libres (jours de la semaine, heures).
 */
export function Bars({ labels, series, extra, dates = true, height = "h-40", axis, format = n, tickFormat }: {
  labels: string[]; series: Series[]; extra?: (i: number) => string; dates?: boolean; height?: string; axis?: [string, string, string];
  format?: (v: number) => string; tickFormat?: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const top = Math.max(2, niceMax(Math.max(1, ...totals)));
  const ticks = top % 2 === 0 ? [0, top / 2, top] : [0, top];
  const sum = totals.reduce((a, b) => a + b, 0);
  const label = (i: number, long = false) => (dates ? dayLabel(labels[i], long) : labels[i]);
  const mid = Math.floor(labels.length / 2);
  return (
    <div>
      {series.length > 1 ? (
        <ul className="mb-5 flex flex-wrap gap-4 text-xs text-slate-700 dark:text-zinc-300">
          {series.map((s) => <li key={s.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name} · {format(s.values.reduce((a, b) => a + b, 0))}</li>)}
        </ul>
      ) : <p className="mb-5 text-xs text-slate-600 dark:text-zinc-400">Total : <b className="font-semibold text-slate-900 dark:text-zinc-50">{format(sum)}</b></p>}
      <div className={`relative ${height} pl-8`} onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => (
          <div key={t} className="pointer-events-none absolute inset-x-0 flex h-0 items-center" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="w-7 pr-1 text-right text-[10px] tabular-nums text-slate-500 dark:text-zinc-400">{(tickFormat ?? format)(t)}</span>
            <span className="h-px flex-1 bg-[var(--viz-grid)]" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-8 flex items-end gap-[2px]">
          {labels.map((key, i) => (
            <button
              key={key + i} type="button" aria-label={`${label(i, true)} : ${series.map((s) => `${s.name} ${s.values[i] ?? 0}`).join(", ")}`}
              onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
              className="relative flex h-full min-w-0 flex-1 flex-col-reverse justify-start rounded-t outline-none focus-visible:ring-2 focus-visible:ring-[var(--viz-1)]"
            >
              {series.map((s, k) => {
                const h = ((s.values[i] ?? 0) / top) * 100;
                const last = series.slice(k + 1).every((o) => !o.values[i]);
                return h > 0 ? <span key={s.name} className={`block w-full ${last ? "rounded-t" : ""} ${k > 0 ? "border-b-2 border-[var(--dash-surface)]" : ""} ${active === null || active === i ? "" : "opacity-60"}`} style={{ height: `${h}%`, background: s.color }} /> : null;
              })}
            </button>
          ))}
        </div>
        {active !== null && (
          <div role="status" className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white dark:bg-zinc-100 dark:text-zinc-900"
            style={{ left: `calc(2rem + (100% - 2rem) * ${Math.min(0.85, Math.max(0.15, (active + 0.5) / labels.length))})` }}>
            <p className="font-semibold">{label(active, true)}</p>
            {series.map((s) => <p key={s.name}>{s.name} : {format(s.values[active])}</p>)}
            {extra && <p className="opacity-80">{extra(active)}</p>}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between pl-8 text-[10px] text-slate-500 dark:text-zinc-400">
        {axis ? axis.map((a) => <span key={a}>{a}</span>) : <><span>{label(0)}</span><span>{label(mid)}</span><span>{label(labels.length - 1)}</span></>}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-600 dark:text-zinc-400">Voir les chiffres</summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="mt-2 w-full">
            <thead><tr className="text-left text-slate-600 dark:text-zinc-400"><th className="py-1 font-medium">{dates ? "Jour" : ""}</th>{series.map((s) => <th key={s.name} className="py-1 text-right font-medium">{s.name}</th>)}</tr></thead>
            <tbody>{labels.map((key, i) => <tr key={key + i} className="border-t border-slate-200 dark:border-white/10"><td className="py-1">{label(i)}</td>{series.map((s) => <td key={s.name} className="py-1 text-right tabular-nums">{format(s.values[i])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Barres horizontales d'une seule série : part de chaque ligne dans le total, valeur et pourcentage écrits. */
export function HBars({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <ul className="mt-2 grid gap-2.5">
      {rows.map(([label, value]) => (
        <li key={label} className="text-sm">
          <div className="flex justify-between gap-3"><span className="min-w-0 truncate">{label}</span><span className="shrink-0 tabular-nums text-slate-600 dark:text-zinc-400">{n(value)} · {pct(value, total)} %</span></div>
          <div className="mt-1 h-2 rounded-full bg-[var(--viz-grid)]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct(value, total))}%`, background: "var(--viz-1)" }} /></div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Entonnoir : chaque étape en barre (part de la 1re étape), avec le passage depuis l'étape précédente écrit à droite.
 */
export function Funnel({ steps }: { steps: [string, number][] }) {
  const first = steps[0]?.[1] ?? 0;
  return (
    <ol className="grid gap-3">
      {steps.map(([label, value], i) => (
        <li key={label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate"><span className="mr-1.5 text-xs text-slate-500 dark:text-zinc-400">{i + 1}.</span>{label}</span>
            <span className="shrink-0 tabular-nums">
              <b className="font-semibold">{n(value)}</b>
              {i > 0 && <span className="ml-1.5 text-xs text-slate-600 dark:text-zinc-400">{pct(value, steps[i - 1][1])} % de l&apos;étape préc.</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-[var(--viz-grid)]"><div className="h-full rounded-full" style={{ width: `${first ? Math.max(value ? 2 : 0, Math.min(100, (value / first) * 100)) : 0}%`, background: "var(--viz-1)" }} /></div>
        </li>
      ))}
    </ol>
  );
}

/** Jauge d'utilisation d'un quota : orange dès 70 %, rouge dès 90 % (avec le pourcentage écrit). */
export function Meter({ label, used, max, format }: { label: string; used: number | undefined; max: number; format: (v: number | undefined) => string }) {
  const p = used === undefined ? 0 : Math.min(100, (used / max) * 100);
  const color = p >= 90 ? "#d03b3b" : p >= 70 ? "#fab219" : "var(--viz-1)";
  return (
    <div className="text-sm">
      <div className="flex justify-between gap-3">
        <span>{label}</span>
        <span className="tabular-nums text-slate-600 dark:text-zinc-400">{format(used)} / {format(max)} · {used === undefined ? "—" : `${p < 1 && p > 0 ? "<1" : Math.round(p)} %`}</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-[var(--viz-grid)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(p, used ? 1 : 0)}%`, background: color }} />
      </div>
    </div>
  );
}

/** Mini-courbe en barres (14 derniers jours) : pas d'axe, le titre de la ligne donne le contexte. */
export function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className="inline-flex h-6 items-end gap-px" role="img" aria-label={`${label} : ${values.join(", ")}`}>
      {values.map((v, i) => <span key={i} className="w-1 rounded-t-[1px]" style={{ height: `${v ? Math.max(12, (v / max) * 100) : 4}%`, background: v ? "var(--viz-2)" : "var(--viz-grid)" }} />)}
    </span>
  );
}

/* ---------- Chargement ---------- */

/** Bloc gris qui « respire » pendant le premier chargement d'une section. */
export const Skel = ({ className = "" }: { className?: string }) => <div aria-hidden className={`dash-skel rounded-xl ${className}`} />;

/** Squelette générique d'une section : chiffres clés, deux graphiques, une liste. */
export function SectionSkeleton() {
  return (
    <div role="status" aria-label="Chargement">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skel key={i} className="h-28" />)}</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2"><Skel className="h-72" /><Skel className="h-72" /></div>
      <Skel className="mt-3 h-48" />
    </div>
  );
}

/** Erreur de chargement d'une section, avec « Réessayer » (les autres sections restent utilisables). */
export function SectionError({ retry }: { retry: () => void }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-center">
      <div>
        <p className="text-lg font-semibold">Données indisponibles pour le moment</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">Vérifiez votre connexion, puis réessayez.</p>
        <button type="button" onClick={retry} className="btn-dash mt-4">Réessayer</button>
      </div>
    </div>
  );
}
