"use client";

import { useEffect, useState } from "react";
import { Ban, Check, CheckCircle2, ExternalLink, FileText, Loader2, ShieldCheck, X, XCircle } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";
import { ago, dateTime, n, plural } from "./data";
import { restaurantHref } from "./nav";
import { Q, refreshAll, useQuery } from "./store";
import { Card, Pill, SectionError, SectionSkeleton } from "./ui";
import { DOCS, docKey, docName, siret } from "./restaurants";

/**
 * Section « À vérifier » : fiches complètes, abonnées, avec SIRET vérifié et justificatifs déposés, qui attendent que
 * l'équipe relise le Kbis avant d'apparaître sur la carte (team_review_queue). « Valider » les met en ligne ;
 * « Refuser » les renvoie en brouillon avec un motif montré au restaurateur (team_review_merchant). Les justificatifs
 * s'ouvrent par des liens temporaires de 10 minutes (espace « documents », privé).
 */

type QueueItem = {
  id: string; name: string; address: string | null; phone: string | null; updated_at: string;
  siret: string | null; legal_name: string | null; naf_code: string | null; siret_verified_at: string | null;
  documents: string[];
};
type Decision = { id: string; name: string; approved: boolean; note?: string; at: number };

/** Motifs fréquents (modifiables avant l'envoi) ; le motif est montré tel quel au restaurateur. */
const REASONS = [
  "Le Kbis est illisible : merci d'en déposer une copie nette.",
  "Le Kbis date de plus de 3 mois : merci d'en déposer un récent.",
  "Le nom ou l'adresse de la fiche ne correspondent pas au Kbis.",
  "Le SIRET du Kbis ne correspond pas à celui de la fiche.",
  "L'attestation de formation à l'hygiène est illisible ou ne correspond pas.",
];
const NOTE_MIN = 5, NOTE_MAX = 300;

export function ReviewPanel() {
  const { data, error, refresh } = useQuery<QueueItem[]>(Q.reviewQueue<QueueItem[]>(), 30_000);
  const [done, setDone] = useState<Decision[]>([]);
  if (!data) return error ? <SectionError retry={refresh} /> : <SectionSkeleton />;
  const record = (d: Decision) => setDone((xs) => [d, ...xs].slice(0, 5));

  return (
    <>
      <p className="text-sm text-slate-600 dark:text-zinc-400">
        {data.length ? `${plural(data.length, "fiche attend", "fiches attendent")} la relecture du Kbis avant d'apparaître sur la carte, la plus ancienne en haut.`
          : "Les fiches complètes attendent ici la relecture du Kbis avant d'apparaître sur la carte."}
      </p>

      {done.length > 0 && (
        <ul aria-live="polite" className="mt-3 grid gap-2">
          {done.map((d) => (
            <li key={`${d.id}-${d.at}`} className={`dash-pop flex items-start gap-2 rounded-xl px-4 py-2.5 text-sm ${d.approved ? "bg-[#0ca30c]/10 text-[#006300] dark:text-[#7be07b]" : "bg-slate-200/70 text-slate-800 dark:bg-white/10 dark:text-zinc-200"}`}>
              {d.approved ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1">
                <a href={restaurantHref(d.id)} className="font-semibold underline-offset-2 hover:underline">{d.name}</a>
                {d.approved ? " validé : en ligne sur la carte." : ` refusé, motif envoyé au restaurateur : « ${d.note} »`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {data.length ? (
        <ul className="mt-4 grid gap-3">
          {data.map((m) => <QueueCard key={m.id} m={m} onDecided={record} />)}
        </ul>
      ) : (
        <div className="mt-4 grid min-h-[30vh] place-items-center rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
          <div>
            <ShieldCheck className="mx-auto h-10 w-10 text-[#0ca30c]" aria-hidden />
            <p className="mt-3 text-lg font-semibold">Rien à vérifier</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">Une fiche apparaîtra ici dès qu&apos;un restaurateur aura tout complété.</p>
          </div>
        </div>
      )}
    </>
  );
}

function QueueCard({ m, onDecided }: { m: QueueItem; onDecided: (d: Decision) => void }) {
  return (
    <li className="min-w-0">
      <Card
        title={m.name}
        hint={<>{[m.address, m.phone].filter(Boolean).join(" · ") || "Adresse non renseignée"} · <a href={restaurantHref(m.id)} className="text-[var(--viz-1)] hover:underline">fiche complète</a></>}
        action={<Pill tone="warning">en attente {ago(m.updated_at).replace("il y a ", "depuis ")}</Pill>}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr] [&>*]:min-w-0">
          <div>
            <h3 className="text-xs font-medium text-slate-600 dark:text-zinc-400">Entreprise (répertoire Sirene)</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-600 dark:text-zinc-400">SIRET</dt><dd className="font-mono tabular-nums">{siret(m.siret)}</dd>
              <dt className="text-slate-600 dark:text-zinc-400">Raison sociale</dt><dd className="break-words">{m.legal_name ?? "—"}</dd>
              <dt className="text-slate-600 dark:text-zinc-400">Code NAF</dt><dd>{m.naf_code ?? "—"}</dd>
              <dt className="text-slate-600 dark:text-zinc-400">Vérifié</dt><dd>{m.siret_verified_at ? dateTime(m.siret_verified_at) : "—"}</dd>
            </dl>
            {m.siret && (
              <a href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${m.siret}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--viz-1)] hover:underline">
                Comparer sur l&apos;Annuaire des entreprises <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-white/[0.06] dark:text-zinc-300">
              À contrôler : le Kbis a moins de 3 mois, son SIRET est bien {siret(m.siret)}, le nom et l&apos;adresse correspondent à la fiche.
            </p>
          </div>
          <QueueDocs paths={m.documents} />
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
          <ReviewActions id={m.id} name={m.name} onDecided={onDecided} />
        </div>
      </Card>
    </li>
  );
}

/** Justificatifs d'une fiche : le plus récent de chaque type, à ouvrir par un lien temporaire. */
function QueueDocs({ paths }: { paths: string[] }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const key = paths.join("|");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    siteClient().storage.from("documents").createSignedUrls(key.split("|"), 600).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) return setFailed(true);
      setLinks(Object.fromEntries(data.flatMap((x) => (x.signedUrl && x.path ? [[x.path, x.signedUrl] as [string, string]] : []))));
    }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [key]);

  // Nom de fichier : « <type>--<horodatage>--<nom> » ; le plus récent de chaque type d'abord
  const byType = (t: string) => paths.filter((p) => docKey(p) === t).sort((a, b) => (b.split("/").pop()! > a.split("/").pop()! ? 1 : -1));
  return (
    <div>
      <h3 className="text-xs font-medium text-slate-600 dark:text-zinc-400">Justificatifs</h3>
      {failed && <p role="alert" className="mt-2 text-sm text-[#a82626] dark:text-[#ff9b9b]">Impossible d&apos;ouvrir les justificatifs pour le moment (actualiser).</p>}
      <ul className="mt-2 grid grid-cols-1 gap-2">
        {DOCS.map((t) => {
          const [latest, ...older] = byType(t.key);
          if (!latest && !t.required) return null;
          return (
            <li key={t.key} className="flex min-w-0 items-center gap-3 rounded-xl p-2.5 text-sm ring-1 ring-slate-200 dark:ring-white/10">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 dark:bg-white/[0.06]"><FileText className="h-4 w-4 text-slate-500" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.short}{t.required ? "" : " (facultatif)"}</p>
                <p className="truncate text-xs text-slate-600 dark:text-zinc-400">
                  {latest ? docName(latest) : "manquant"}{older.length ? ` · ${plural(older.length, "ancienne version", "anciennes versions")}` : ""}
                </p>
              </div>
              {latest ? (links[latest] ? (
                <a href={links[latest]} target="_blank" rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-slate-300 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10">
                  Ouvrir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : !failed && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Préparation du lien" />)
                : <Pill tone="critical">manquant</Pill>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">{plural(paths.length, "fichier déposé", "fichiers déposés")} · liens valables 10 minutes</p>
    </div>
  );
}

/**
 * Valider (avec confirmation : la fiche part sur la carte) ou refuser (motif obligatoire, 5 à 300 caractères, montré
 * au restaurateur). Après la décision, toutes les données en mémoire sont relues (liste, fiches, tableau de bord).
 */
export function ReviewActions({ id, name, onDecided }: { id: string; name: string; onDecided?: (d: Decision) => void }) {
  const [mode, setMode] = useState<"idle" | "approve" | "refuse">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = note.trim();

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    const { error: e } = await siteClient().rpc("team_review_merchant", { p_merchant_id: id, p_approve: approve, p_note: approve ? null : trimmed });
    setBusy(false);
    if (e) {
      setError(e.code === "42501" ? "Réservé à l'équipe FlashMiam." : e.code === "P0002" ? "Cette fiche n'existe plus." : e.message || "Décision impossible pour le moment, réessayez.");
      return;
    }
    onDecided?.({ id, name, approved: approve, note: approve ? undefined : trimmed, at: Date.now() });
    setMode("idle");
    setNote("");
    await refreshAll();
  };

  const btn = "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50";
  return (
    <div>
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("approve")} className={`${btn} bg-[#0a7d0a] text-white hover:bg-[#086a08]`}>
            <Check className="h-4 w-4" aria-hidden /> Valider
          </button>
          <button type="button" onClick={() => setMode("refuse")} className={`${btn} text-[#a82626] ring-1 ring-[#d03b3b]/40 hover:bg-[#d03b3b]/10 dark:text-[#ff9b9b]`}>
            <Ban className="h-4 w-4" aria-hidden /> Refuser
          </button>
        </div>
      )}

      {mode === "approve" && (
        <div className="dash-pop flex flex-wrap items-center gap-2">
          <span className="text-sm">Mettre <b>{name}</b> en ligne sur la carte ?</span>
          <button type="button" disabled={busy} onClick={() => decide(true)} className={`${btn} bg-[#0a7d0a] text-white hover:bg-[#086a08]`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Oui, valider
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("idle")} className={`${btn} text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10`}>Annuler</button>
        </div>
      )}

      {mode === "refuse" && (
        <form className="dash-pop grid gap-2" onSubmit={(e) => { e.preventDefault(); if (trimmed.length >= NOTE_MIN) void decide(false); }}>
          <label htmlFor={`note-${id}`} className="text-sm font-medium">Motif du refus <span className="font-normal text-slate-600 dark:text-zinc-400">(montré au restaurateur, qui corrige puis renvoie sa fiche)</span></label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setNote(r)} className="rounded-full px-2.5 py-1 text-xs ring-1 ring-slate-300 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10">{r.split(" :")[0].replace(/\.$/, "")}</button>
            ))}
          </div>
          <textarea id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} rows={3} autoFocus
            placeholder="Ex. : Le Kbis date de plus de 3 mois, merci d'en déposer un récent."
            className="w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-[var(--viz-1)] dark:bg-white/[0.04] dark:ring-white/15" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy || trimmed.length < NOTE_MIN} className={`${btn} bg-[#c03030] text-white hover:bg-[#a82626]`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />} Envoyer le refus
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode("idle"); setError(null); }} className={`${btn} text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10`}>
              <X className="h-4 w-4" aria-hidden /> Annuler
            </button>
            <span className={`ml-auto text-xs tabular-nums ${trimmed.length < NOTE_MIN ? "text-slate-500" : "text-slate-600 dark:text-zinc-400"}`}>
              {trimmed.length < NOTE_MIN ? `${n(NOTE_MIN - trimmed.length)} caractère(s) de plus` : `${n(trimmed.length)} / ${NOTE_MAX}`}
            </span>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-[#a82626] dark:text-[#ff9b9b]">{error}</p>}
    </div>
  );
}
