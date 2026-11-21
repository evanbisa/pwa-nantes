"use client";

import { useState } from "react";
import { Check, ClipboardCopy, EyeOff, RotateCcw } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";
import { REPO, ago, dateTime, delta, n, type Data, type ErrorItem } from "./data";
import { Bars, Card, Muted, Pill, Spark, Tile } from "./ui";
import { refreshAll } from "./store";

/**
 * Onglet « Bugs » : erreurs vues sur les appareils (carte et application) et réponses en erreur du serveur.
 * Chaque bug peut être marqué « corrigé » (il revient en tête, signalé « réapparu », s'il se reproduit ensuite) ou
 * « ignoré » (bruit sans importance). « Copier » met un résumé prêt à coller dans une demande de correction.
 */

type Filter = "open" | "resolved" | "ignored" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "À traiter" }, { id: "resolved", label: "Corrigés" }, { id: "ignored", label: "Ignorés" }, { id: "all", label: "Tous" },
];
const KIND: Record<ErrorItem["kind"], string> = { js: "JavaScript", promise: "Promesse non gérée", server: "Serveur" };
const APP: Record<ErrorItem["app"], string> = { carte: "Carte", app: "Appli (/app)" };
const PLATFORM: Record<string, string> = { ios: "iPhone/iPad", android: "Android", desktop: "Ordinateur" };

const counts = (m: Record<string, number>, rename: Record<string, string> = {}) =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${rename[k] ?? k} (${n(v)})`).join(", ") || "—";

function summary(e: ErrorItem) {
  return [
    `Bug FlashMiam (${APP[e.app]}, ${KIND[e.kind]}) : ${e.message}`,
    e.source ? `Fichier : ${e.source}` : null,
    `Vu ${e.occurrences} fois sur ${e.days_seen} jour(s), du ${dateTime(e.first_at)} au ${dateTime(e.last_at)}.`,
    `Pages : ${counts(e.pages)}`,
    `Appareils : ${counts(e.platforms, PLATFORM)} · Navigateurs : ${counts(e.browsers)}`,
    `Versions publiées : ${counts(e.releases)}`,
    e.stack ? `Pile d'appels :\n${e.stack}` : null,
  ].filter(Boolean).join("\n");
}

export function Bugs({ d }: { d: Data }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const e = d.errors;
  const list = d.error_list.filter((x) =>
    filter === "all" ? true : filter === "open" ? x.open : filter === "resolved" ? x.status === "resolved" && !x.reappeared : x.status === "ignored");

  const triage = async (fp: string, status: "resolved" | "ignored" | null) => {
    setBusy(fp);
    setFailed(false);
    const { error } = await siteClient().rpc("team_error_triage", { p_fingerprint: fp, p_status: status });
    if (error) setFailed(true);
    else await refreshAll();
    setBusy(null);
  };

  return (
    <>
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Bugs rencontrés (${d.days} j)`} value={n(e.occurrences)} change={delta(e.occurrences, d.previous.errors)} upIsGood={false} note={`${n(e.today)} aujourd'hui`} />
        <Tile label="Bugs différents" value={n(e.distinct)} note={`${n(d.error_list.filter((x) => x.open).length)} à traiter`} />
        <Tile label="Nouveaux (24 h)" value={n(e.new_24h)} note="jamais vus avant" />
        <Tile label="Erreurs du serveur" value={n(e.server)} note="réponses 5xx, table ou fonction introuvable" />
      </section>

      <Card className="mt-3" title="Bugs par jour" hint="Nombre de fois où un bug s'est produit (au plus une fois par bug et par visite).">
        <Bars
          labels={d.errors_daily.map((x) => x.day)}
          series={[
            { name: "Navigateur (JavaScript)", color: "var(--viz-1)", values: d.errors_daily.map((x) => x.js) },
            { name: "Serveur", color: "var(--viz-2)", values: d.errors_daily.map((x) => x.server) },
          ]}
        />
      </Card>

      <Card
        className="mt-3" title="Liste des bugs"
        hint="Les plus récents en haut. Ouvrir un bug pour voir le détail, puis le marquer corrigé une fois la correction publiée."
        action={
          <div role="radiogroup" aria-label="Filtre" className="flex shrink-0 rounded-full bg-slate-200/70 p-0.5 text-xs dark:bg-white/[0.06]">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}
                className="rounded-full px-2.5 py-1 font-medium text-slate-600 aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm dark:text-zinc-400 dark:aria-checked:bg-white/15 dark:aria-checked:text-white">
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {failed && <p role="alert" className="mb-3 text-sm text-[#a82626] dark:text-[#ff9b9b]">Modification impossible pour le moment, réessayez.</p>}
        {list.length ? (
          <ul className="grid gap-2">
            {list.map((x) => <BugRow key={x.fingerprint} e={x} now={new Date(d.generated_at).getTime()} busy={busy === x.fingerprint} triage={triage} />)}
          </ul>
        ) : <Muted>{filter === "open" ? "Aucun bug à traiter sur la période. 🎉" : "Aucun bug dans cette liste."}</Muted>}
      </Card>

      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
        Ce qui est envoyé : le message d&apos;erreur, le fichier, la page (sans ses paramètres), le type d&apos;appareil, le navigateur et la version publiée.
        Aucun identifiant de personne ni d&apos;appareil ; la base efface les e-mails, jetons et identifiants qui traîneraient dans un message. Gardé 90 jours.
      </p>
    </>
  );
}

function BugRow({ e, now, busy, triage }: { e: ErrorItem; now: number; busy: boolean; triage: (fp: string, s: "resolved" | "ignored" | null) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary(e)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* presse-papiers refusé */ }
  };
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:ring-white/15 dark:hover:bg-white/10";
  return (
    <li className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone={e.kind === "server" ? "warning" : "info"}>{KIND[e.kind]}</Pill>
              <Pill>{APP[e.app]}</Pill>
              {e.reappeared && <Pill tone="critical">réapparu</Pill>}
              {e.status === "resolved" && !e.reappeared && <Pill tone="good">corrigé</Pill>}
              {e.status === "ignored" && <Pill>ignoré</Pill>}
              {now - new Date(e.first_at).getTime() < 864e5 && <Pill tone="critical">nouveau</Pill>}
            </div>
            <p className="mt-1.5 font-mono text-[13px] leading-snug break-words">{e.message}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">
              <b className="font-semibold text-slate-900 dark:text-zinc-100">{n(e.occurrences)} fois</b> · {n(e.days_seen)} jour(s) · dernière fois {ago(e.last_at)} · {counts(e.platforms, PLATFORM)}
            </p>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <Spark values={e.spark} label="14 derniers jours" />
            <p className="text-[10px] text-slate-500 dark:text-zinc-400">14 j</p>
          </div>
        </summary>
        <div className="border-t border-slate-200 p-3 text-sm dark:border-white/10">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Row k="Fichier" v={e.source ? <code className="text-xs break-all">{e.source}</code> : "—"} />
            <Row k="Première fois" v={dateTime(e.first_at)} />
            <Row k="Pages" v={counts(e.pages)} />
            <Row k="Navigateurs" v={counts(e.browsers)} />
            <Row k="Versions publiées" v={
              <span className="flex flex-wrap gap-x-2">
                {Object.entries(e.releases).sort((a, b) => b[1] - a[1]).map(([r, c]) => /^[0-9a-f]{7}$/.test(r)
                  ? <a key={r} href={`${REPO}/commit/${r}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-[var(--viz-1)] hover:underline">{r} ({n(c)})</a>
                  : <span key={r} className="text-xs">{r} ({n(c)})</span>)}
              </span>
            } />
            <Row k="Avec un compte connecté" v={`${n(e.signed_in)} fois sur ${n(e.occurrences)}`} />
          </dl>
          {e.stack && (
            <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-100 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all dark:bg-black/40">{e.stack}</pre>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {e.status !== "resolved" || e.reappeared ? (
              <button type="button" disabled={busy} className={btn} onClick={() => triage(e.fingerprint, "resolved")}><Check className="h-3.5 w-3.5" aria-hidden /> Marquer corrigé</button>
            ) : null}
            {e.status !== "ignored" && (
              <button type="button" disabled={busy} className={btn} onClick={() => triage(e.fingerprint, "ignored")}><EyeOff className="h-3.5 w-3.5" aria-hidden /> Ignorer</button>
            )}
            {e.status && (
              <button type="button" disabled={busy} className={btn} onClick={() => triage(e.fingerprint, null)}><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Rouvrir</button>
            )}
            <button type="button" className={btn} onClick={copy}><ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> {copied ? "Copié !" : "Copier le résumé"}</button>
          </div>
        </div>
      </details>
    </li>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="min-w-0"><dt className="text-xs text-slate-600 dark:text-zinc-400">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>
);
