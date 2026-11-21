"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Search, XCircle } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";
import { ago, bytes, dateTime, dayLabel, delta, n } from "./data";
import { restaurantHref, sectionHref } from "./nav";
import { Q, refreshAll, useQuery } from "./store";
import { Bars, Card, HBars, Kv, Muted, Notice, Pill, SectionError, SectionSkeleton, Tile } from "./ui";
import { ModerationButtons } from "./moderation";

/**
 * Fiches des restaurants, vues par l'équipe FlashMiam (section « Fiches restaurants » du tableau de bord) :
 *  - #fiches : tous les restaurants inscrits (et les comptes restaurateur sans fiche), avec leurs justificatifs ;
 *  - #fiches/<restaurant> : tout sur une fiche : justificatifs à ouvrir, entreprise, responsable, abonnement, fiche, les mêmes
 *    statistiques que le restaurateur voit dans son espace, visites en caisse, avis (avec modération).
 * Données calculées par la base (team_merchants, team_merchant), réservées aux comptes de l'équipe ; justificatifs
 * ouverts par des liens temporaires (10 minutes).
 */

/* ---------- Libellés ---------- */

const CATEGORY: Record<string, string> = { food_truck: "Food-truck", kebab: "Kebab", burger: "Burger", sweets: "Douceurs", pizza: "Pizza", other: "Autre" };
const STATUS: Record<string, [string, "good" | "warning" | "critical" | "neutral"]> = {
  published: ["En ligne", "good"], draft: ["Brouillon", "neutral"], awaiting_docs: ["Attend ses justificatifs", "warning"],
  suspended: ["Suspendue", "critical"], no_fiche: ["Pas de fiche", "neutral"],
};
const DOCS: { key: "kbis" | "hygiene" | "ddpp" | "licence"; label: string; short: string; required: boolean }[] = [
  { key: "kbis", label: "Extrait Kbis, avis de situation Sirene ou extrait D1 (moins de 3 mois)", short: "Kbis", required: true },
  { key: "hygiene", label: "Attestation de formation à l'hygiène alimentaire (HACCP)", short: "Hygiène", required: true },
  { key: "ddpp", label: "Récépissé de déclaration DDPP (Cerfa n° 13984)", short: "DDPP", required: false },
  { key: "licence", label: "Licence de débit de boissons ou licence restaurant", short: "Licence", required: false },
];
const SUB_STATUS: Record<string, string> = { active: "Actif", past_due: "Paiement refusé", canceled: "Terminé", cancelled: "Terminé", expired: "Terminé", pending: "En attente" };
const PROMO_KIND: Record<string, string> = {
  day: "Promo du jour", week: "Promo de la semaine", student: "Offre étudiante", other: "Bon plan", lunch: "Formule midi", afterwork: "Afterwork", weekend: "Week-end",
};
const SOURCES: [string, string][] = [["map", "Carte"], ["list", "Liste"], ["search", "Recherche"], ["offers", "Offres autour de moi"], ["story", "Story"], ["notif", "Notification"], ["link", "Lien partagé"]];
const WEEKDAY = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const subLabel = (s: Sub | null) => (s ? `${s.plan ? s.plan[0].toUpperCase() + s.plan.slice(1) : "?"}${s.period ? ` · ${s.period === "year" ? "an" : "mois"}` : ""}${s.mode === "demo" ? " (démo)" : ""}` : "—");
const siret = (v: string | null | undefined) => (v ? v.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4") : "—");

/* ---------- Données ---------- */

type Sub = { status: string; mode: string; plan: string | null; period: string | null; current_period_end: string | null; cancel_at_period_end: boolean; started_at?: string; updated_at?: string };
type Row = {
  id: string | null; user_id: string; name: string | null; category: string | null; status: string; is_test: boolean; created_at: string; published_at: string | null;
  owner: string | null; email: string | null; phone: string | null; siret: string | null; siret_verified: boolean; legal_name: string | null;
  subscription: Sub | null; docs: Record<"kbis" | "hygiene" | "ddpp" | "licence", boolean>;
  views_30d: number; followers: number; reviews: number; rating: number | null; reported: number; qr_visits_30d: number;
};
type Review = { id: string; rating: number; comment: string | null; author_name: string; reply: string | null; replied_at: string | null; created_at: string; reported_at: string | null };
type Analytics = {
  period: { days: number; from: string; to: string };
  totals: Record<string, number> & { rating: number | null };
  previous: Record<string, number>;
  sources: Record<string, number>;
  daily: { day: string; views: number; visitors: number; routes: number; phone: number; story_views: number; new_followers: number }[];
  hours: number[];
  stories: { id: string; caption: string | null; image_path: string | null; created_at: string; expires_at: string; views: number; likes: number; clicks: number }[];
  promos: { id: string; kind: string; title: string; created_at: string; ends_at: string | null; active: boolean; clicks: number }[];
  audience: null | Record<string, number>;
  dishes: { dish: string; likes: number }[];
};
type Detail = {
  merchant: {
    id: string; name: string; category: string; description: string | null; address: string | null; phone: string | null; status: string; is_test: boolean; is_open: boolean;
    opening_hours: { services?: [string, string][]; closed_on?: number[] } | null; menu_json: { name: string; price?: number; section?: string }[] | null;
    photos_urls: string[] | null; created_at: string; published_at: string | null; honor_at: string | null; accepts_meal_vouchers: boolean;
  };
  docs_ok: boolean;
  legal: null | { siret: string; verified_at: string | null; legal_name: string | null; naf_code: string | null; sirene: Record<string, unknown> | null };
  owner: null | { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean; terms_version: string | null; terms_accepted_at: string | null };
  subscription: Sub | null;
  documents: { path: string; size: number | null; mime: string | null; uploaded_at: string }[];
  analytics: Analytics | null;
  visits: { today: number; last_7d: number; last_30d: number; promo_30d: number; clients_30d: number };
  reviews: Review[];
  actions: { at: string; action: "review_deleted" | "review_kept"; detail: string | null; who: string }[];
};

const BackLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">
    <ArrowLeft className="h-4 w-4" aria-hidden /> {children}
  </a>
);
function DocMark({ ok, required, label }: { ok: boolean; required: boolean; label: string }) {
  if (ok) return <span className="inline-flex items-center gap-1 text-xs text-[#006300] dark:text-[#0ca30c]"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{label}</span>;
  if (required) return <span className="inline-flex items-center gap-1 text-xs text-[#a82626] dark:text-[#ff9b9b]"><XCircle className="h-3.5 w-3.5" aria-hidden />{label} manquant</span>;
  return null;
}

/* ===================================== Liste ===================================== */

type Filter = "all" | "published" | "pending" | "docs" | "test";
const FILTERS: { id: Filter; label: string; test: (r: Row) => boolean }[] = [
  { id: "all", label: "Tous", test: (r) => !r.is_test },
  { id: "published", label: "En ligne", test: (r) => !r.is_test && r.status === "published" },
  { id: "pending", label: "En préparation", test: (r) => !r.is_test && r.status !== "published" },
  { id: "docs", label: "Justificatifs manquants", test: (r) => !r.is_test && !!r.id && (!r.docs.kbis || !r.docs.hygiene) },
  { id: "test", label: "Fiches de test", test: (r) => r.is_test },
];

export function RestaurantList() {
  const { data, error, refresh } = useQuery<Row[]>(Q.merchants<Row[]>());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const rows = data ?? [];
  // Recherche sans tenir compte des majuscules ni des espaces (un SIRET tapé « 123 456 789 00012 » est trouvé)
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "");
  const q = norm(query);
  const shown = rows
    .filter(FILTERS.find((f) => f.id === filter)!.test)
    .filter((r) => !q || [r.name, r.owner, r.email, r.legal_name, r.siret, r.phone].some((v) => v && norm(v).includes(q)));
  if (!data) return error ? <SectionError retry={refresh} /> : <SectionSkeleton />;
  const real = rows.filter((r) => !r.is_test);
  const missing = real.filter((r) => r.id && (!r.docs.kbis || !r.docs.hygiene)).length;
  return (
    <>
      <p className="text-sm text-slate-600 dark:text-zinc-400">
        {n(real.length)} compte(s) restaurateur · {n(real.filter((r) => r.status === "published").length)} en ligne · {n(missing)} avec des justificatifs obligatoires manquants
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Rechercher</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, responsable, e-mail, SIRET…"
            className="w-full rounded-full bg-white py-2 pr-4 pl-9 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-[var(--viz-1)] dark:bg-white/[0.04] dark:ring-white/10"
          />
        </label>
        <div role="radiogroup" aria-label="Filtre" className="flex max-w-full overflow-x-auto rounded-full bg-slate-200/70 p-1 dark:bg-white/[0.06]">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-600 aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm dark:text-zinc-400 dark:aria-checked:bg-white/15 dark:aria-checked:text-white">
              {f.label} · {n(rows.filter(f.test).length)}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Restaurant</th><th className="px-2 py-3 font-medium">État</th>
                <th className="px-2 py-3 font-medium">Justificatifs</th><th className="px-2 py-3 font-medium">SIRET</th>
                <th className="px-2 py-3 font-medium">Abonnement</th><th className="px-2 py-3 text-right font-medium">Vues 30 j</th>
                <th className="px-2 py-3 text-right font-medium">Abonnés</th><th className="px-2 py-3 text-right font-medium">Avis</th>
                <th className="px-4 py-3 text-right font-medium">Inscrit</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => {
                  const [label, tone] = STATUS[r.status] ?? [r.status, "neutral"];
                  return (
                    <tr key={r.id ?? r.user_id} className="border-t border-slate-200 align-top dark:border-white/10">
                      <td className="px-4 py-3">
                        {r.id ? <a href={restaurantHref(r.id)} className="font-semibold text-[var(--viz-1)] hover:underline">{r.name}</a> : <span className="font-semibold">(fiche pas encore créée)</span>}
                        {r.is_test && <span className="ml-2"><Pill>test</Pill></span>}
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">{[r.category && CATEGORY[r.category], r.owner, r.email].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="px-2 py-3"><Pill tone={tone}>{label}</Pill></td>
                      <td className="px-2 py-3">
                        {r.id ? (
                          <div className="grid gap-0.5">
                            {DOCS.map((d) => <DocMark key={d.key} ok={r.docs[d.key]} required={d.required} label={d.short} />)}
                          </div>
                        ) : <span className="text-xs text-slate-500">—</span>}
                      </td>
                      <td className="px-2 py-3 text-xs whitespace-nowrap">{r.siret_verified ? <span className="text-[#006300] dark:text-[#0ca30c]">✓ {siret(r.siret)}</span> : "—"}</td>
                      <td className="px-2 py-3 text-xs">{r.subscription ? <>{subLabel(r.subscription)}<br /><span className="text-slate-600 dark:text-zinc-400">{SUB_STATUS[r.subscription.status] ?? r.subscription.status}</span></> : "—"}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{n(r.views_30d)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{n(r.followers)}</td>
                      <td className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
                        {r.reviews ? `${String(r.rating ?? "").replace(".", ",")}★ · ${n(r.reviews)}` : "—"}
                        {r.reported > 0 && <div className="mt-1"><Pill tone="warning">{n(r.reported)} signalé(s)</Pill></div>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs whitespace-nowrap" title={dateTime(r.created_at)}>{ago(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="p-5"><Muted>Aucun restaurant dans cette liste.</Muted></div>}
      </section>
    </>
  );
}

/* ===================================== Fiche d'un restaurant ===================================== */

export function RestaurantDetail({ id, days }: { id: string; days: number }) {
  const { data: d, error, refresh } = useQuery<Detail>(Q.merchant<Detail>(id, Math.min(days, 90)));
  if (!d) {
    if (error?.code === "P0002") return <Notice title="Restaurant introuvable" text="Cette fiche n'existe plus (compte supprimé ?)." action={<a href={sectionHref("directory")} className="btn-dash">Toutes les fiches</a>} />;
    return <><BackLink href={sectionHref("directory")}>Toutes les fiches</BackLink><div className="mt-4">{error ? <SectionError retry={refresh} /> : <SectionSkeleton />}</div></>;
  }
  const m = d.merchant;
  const [label, tone] = STATUS[m.status] ?? [m.status, "neutral"];
  const docsMissing = DOCS.filter((t) => t.required && !d.documents.some((f) => docKey(f.path) === t.key));
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <BackLink href={sectionHref("directory")}>Toutes les fiches</BackLink>
          <h2 className="mt-2 text-2xl font-bold tracking-tight break-words sm:text-3xl">{m.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill tone={tone}>{label}</Pill>
            {m.is_test && <Pill>fiche de test</Pill>}
            {m.status === "published" && <Pill tone={m.is_open ? "good" : "neutral"}>{m.is_open ? "affichée" : "masquée par le restaurateur"}</Pill>}
            <span className="text-sm text-slate-600 dark:text-zinc-400">{CATEGORY[m.category] ?? m.category} · inscrit le {dateTime(m.created_at)}{m.published_at && ` · en ligne depuis le ${dayLabel(m.published_at)}`}</span>
          </div>
        </div>
      </header>

      {docsMissing.length > 0 && (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-xl bg-[#fab219]/15 px-4 py-3 text-sm text-[#7a5200] dark:text-[#ffd27a]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Justificatif(s) obligatoire(s) manquant(s) : {docsMissing.map((t) => t.short).join(", ")}. Sans eux, la fiche ne peut pas apparaître sur la carte.
        </p>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <Documents docs={d.documents} />
        <div className="grid content-start gap-3">
          <Company legal={d.legal} />
          <Owner owner={d.owner} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Subscription sub={d.subscription} />
        <Fiche m={m} />
      </div>

      <h2 className="mt-8 text-lg font-bold tracking-tight">Statistiques du restaurant</h2>
      <p className="text-sm text-slate-600 dark:text-zinc-400">Les mêmes chiffres que dans l&apos;espace du restaurateur, sur {Math.min(days, 90)} jours.</p>
      {d.analytics ? <Stats a={d.analytics} visits={d.visits} /> : <Muted>Pas encore de statistiques.</Muted>}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Avis" hint={`${n(d.reviews.length)} avis (les signalés d'abord, 50 au plus)`}>
          {d.reviews.length ? (
            <ul className="grid gap-3">
              {d.reviews.map((r) => (
                <li key={r.id} className={`rounded-xl p-3 text-sm ring-1 ${r.reported_at ? "ring-[#fab219]/60" : "ring-slate-200 dark:ring-white/10"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><span aria-label={`${r.rating} sur 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> · <b className="font-semibold">{r.author_name}</b></span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400">{r.reported_at && <Pill tone="warning">signalé {ago(r.reported_at)}</Pill>}{dateTime(r.created_at)}</span>
                  </div>
                  <p className="mt-1 break-words">{r.comment || <i className="text-slate-500">(sans commentaire)</i>}</p>
                  {r.reply && <p className="mt-2 border-l-2 border-slate-300 pl-3 text-slate-700 dark:border-white/20 dark:text-zinc-300"><b className="font-medium">Réponse :</b> {r.reply}</p>}
                  <ModerationButtons reviewId={r.id} reported={!!r.reported_at} onDone={refreshAll} />
                </li>
              ))}
            </ul>
          ) : <Muted>Aucun avis.</Muted>}
        </Card>
        <Card title="Historique de modération" hint="Décisions de l'équipe sur les avis de ce restaurant (13 mois).">
          {d.actions.length ? (
            <ul className="grid gap-2 text-sm">
              {d.actions.map((a, i) => (
                <li key={i} className="border-t border-slate-200 pt-2 first:border-t-0 first:pt-0 dark:border-white/10">
                  <b className="font-medium">{a.action === "review_deleted" ? "Avis supprimé" : "Avis gardé"}</b> par {a.who}, {ago(a.at)}
                  {a.detail && <p className="mt-0.5 text-xs break-words text-slate-600 dark:text-zinc-400">{a.detail}</p>}
                </li>
              ))}
            </ul>
          ) : <Muted>Aucune décision pour l&apos;instant.</Muted>}
        </Card>
      </div>
    </>
  );
}

/* ---------- Justificatifs ---------- */

/** « <fiche>/kbis--1700000000000--Mon Kbis.pdf » → « kbis » ; date d'envoi ; nom d'origine. */
const docKey = (path: string) => path.split("/").pop()!.split("--")[0];
const docName = (path: string) => path.split("/").pop()!.split("--").slice(2).join("--") || path.split("/").pop()!;

function Documents({ docs }: { docs: Detail["documents"] }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const paths = docs.map((f) => f.path).join("|");
  // Liens temporaires (10 minutes) : les justificatifs restent privés, seule l'équipe peut les obtenir
  useEffect(() => {
    if (!paths) return;
    let alive = true;
    siteClient().storage.from("documents").createSignedUrls(paths.split("|"), 600).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) return setFailed(true);
      setLinks(Object.fromEntries(data.flatMap((x) => (x.signedUrl && x.path ? [[x.path, x.signedUrl] as [string, string]] : []))));
    }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [paths]);

  return (
    <Card title="Justificatifs" hint="Déposés par le restaurateur. Liens valables 10 minutes (actualiser pour en obtenir de nouveaux).">
      {failed && <p role="alert" className="mb-3 text-sm text-[#a82626] dark:text-[#ff9b9b]">Impossible d&apos;ouvrir les justificatifs pour le moment.</p>}
      <ul className="grid gap-3">
        {DOCS.map((t) => {
          const files = docs.filter((f) => docKey(f.path) === t.key);
          return (
            <li key={t.key} className="rounded-xl p-3 ring-1 ring-slate-200 dark:ring-white/10">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-slate-600 dark:text-zinc-400">{t.required ? "Obligatoire pour apparaître sur la carte" : "Facultatif"}</p>
                </div>
                {files.length ? <Pill tone="good">déposé</Pill> : t.required ? <Pill tone="critical">manquant</Pill> : <Pill>non fourni</Pill>}
              </div>
              {files.map((f, i) => (
                <div key={f.path} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {f.mime?.startsWith("image/") && links[f.path]
                    // eslint-disable-next-line @next/next/no-img-element -- lien temporaire du stockage privé, pas d'optimisation possible
                    ? <img src={links[f.path]} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-white/10" />
                    : <span className="grid h-14 w-14 place-items-center rounded-lg bg-slate-100 dark:bg-white/[0.06]"><FileText className="h-6 w-6 text-slate-500" aria-hidden /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{docName(f.path)}</p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      {f.mime === "application/pdf" ? "PDF" : f.mime?.replace("image/", "").toUpperCase() ?? "?"} · {bytes(f.size ?? undefined)} · envoyé le {dateTime(f.uploaded_at)}
                      {i > 0 && " · remplacé depuis"}
                    </p>
                  </div>
                  {links[f.path] ? (
                    <a href={links[f.path]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-slate-300 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10">
                      Ouvrir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : !failed && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Préparation du lien" />}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Entreprise, responsable, abonnement, fiche ---------- */

function Company({ legal }: { legal: Detail["legal"] }) {
  const s = legal?.sirene ?? {};
  const str = (k: string) => (typeof s[k] === "string" && s[k] ? String(s[k]) : null);
  return (
    <Card title="Entreprise" hint="Vérifiée dans le répertoire Sirene (INSEE) à l'inscription.">
      {legal ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Kv k="SIRET" v={siret(legal.siret)} />
          <Kv k="Vérifié" v={legal.verified_at ? dayLabel(legal.verified_at) : "non"} />
          <div className="col-span-2"><Kv k="Raison sociale" v={legal.legal_name ?? "—"} /></div>
          <Kv k="Code NAF" v={legal.naf_code ?? "—"} />
          <Kv k="État (Sirene)" v={str("etat_administratif") === "A" ? "Actif" : str("etat_administratif") === "F" ? "Fermé" : str("etat_administratif") ?? "—"} />
          {str("adresse") && <div className="col-span-2"><Kv k="Adresse déclarée" v={str("adresse")!} /></div>}
          <div className="col-span-2">
            <a href={`https://annuaire-entreprises.data.gouv.fr/etablissement/${legal.siret}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--viz-1)] hover:underline">
              Voir sur l&apos;Annuaire des entreprises <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </dl>
      ) : <Muted>SIRET pas encore vérifié.</Muted>}
    </Card>
  );
}

function Owner({ owner }: { owner: Detail["owner"] }) {
  if (!owner) return null;
  return (
    <Card title="Responsable">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2"><Kv k="Nom" v={[owner.first_name, owner.last_name].filter(Boolean).join(" ") || "—"} /></div>
        <div className="col-span-2 min-w-0">
          <dt className="text-xs text-slate-600 dark:text-zinc-400">Contact</dt>
          <dd className="mt-0.5 break-all">
            {owner.email ? <a href={`mailto:${owner.email}`} className="text-[var(--viz-1)] hover:underline">{owner.email}</a> : "—"}
            {owner.phone && <> · <a href={`tel:${owner.phone.replace(/\s/g, "")}`} className="text-[var(--viz-1)] hover:underline">{owner.phone}</a></>}
            {!owner.email_confirmed && <span className="ml-2"><Pill tone="warning">e-mail non confirmé</Pill></span>}
          </dd>
        </div>
        <Kv k="Compte créé" v={dayLabel(owner.created_at)} />
        <Kv k="Dernière connexion" v={ago(owner.last_sign_in_at)} />
        <div className="col-span-2"><Kv k="Conditions acceptées" v={owner.terms_accepted_at ? `version ${owner.terms_version} · ${dayLabel(owner.terms_accepted_at)}` : "—"} /></div>
      </dl>
    </Card>
  );
}

function Subscription({ sub }: { sub: Sub | null }) {
  return (
    <Card title="Abonnement">
      {sub ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Kv k="Formule" v={subLabel(sub)} />
          <Kv k="État" v={SUB_STATUS[sub.status] ?? sub.status} />
          <Kv k="Paiement" v={sub.mode === "whop" ? "Whop" : sub.mode === "demo" ? "Démonstration" : sub.mode} />
          <Kv k="Depuis" v={sub.started_at ? dayLabel(sub.started_at) : "—"} />
          <Kv k="Échéance" v={sub.current_period_end ? dayLabel(sub.current_period_end) : "—"} />
          <Kv k="Renouvellement" v={sub.cancel_at_period_end ? "résilié à l'échéance" : "automatique"} />
        </dl>
      ) : <Muted>Aucun abonnement.</Muted>}
    </Card>
  );
}

function Fiche({ m }: { m: Detail["merchant"] }) {
  const h = m.opening_hours ?? {};
  const menu = m.menu_json ?? [];
  const sections = new Set(menu.map((x) => x.section).filter(Boolean));
  return (
    <Card title="Fiche publique">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2"><Kv k="Adresse" v={m.address || "—"} /></div>
        <Kv k="Téléphone" v={m.phone || "—"} />
        <Kv k="Titres-restaurant" v={m.accepts_meal_vouchers ? "acceptés" : "non"} />
        <div className="col-span-2"><Kv k="Horaires" v={`${(h.services ?? []).map(([a, b]) => `${a}–${b}`).join(", ") || "—"}${h.closed_on?.length ? ` · fermé le ${h.closed_on.map((x) => WEEKDAY[x]).join(", ")}` : ""}`} /></div>
        <Kv k="Carte" v={`${n(menu.length)} plat(s)`} sub={sections.size ? `${n(sections.size)} rubrique(s)` : undefined} />
        <Kv k="Attestation sur l'honneur" v={m.honor_at ? dayLabel(m.honor_at) : "non donnée"} />
      </dl>
      {m.description && <p className="mt-4 text-sm break-words whitespace-pre-line text-slate-700 dark:text-zinc-300">{m.description}</p>}
      {!!m.photos_urls?.length && (
        <div className="mt-4 flex flex-wrap gap-2">
          {m.photos_urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- photo du stockage public, pas d'optimisation (export statique) */}
              <img src={u} alt="" loading="lazy" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-white/10" />
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Statistiques (mêmes chiffres que l'espace restaurateur) ---------- */

function Stats({ a, visits }: { a: Analytics; visits: Detail["visits"] }) {
  const t = a.totals, p = a.previous;
  const routes = t.walk + t.car;
  const sourceTotal = SOURCES.reduce((s, [k]) => s + (a.sources[k] ?? 0), 0);
  const au = a.audience;
  return (
    <>
      <section aria-label="Chiffres clés du restaurant" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Fiche vue" value={n(t.views)} change={delta(t.views, p.views)} />
        <Tile label="Personnes" value={n(t.visitors)} change={delta(t.visitors, p.visitors)} note={`${n(t.returning)} revenues`} />
        <Tile label="Itinéraires" value={n(routes)} change={delta(routes, p.routes)} note={`${n(t.walk)} à pied · ${n(t.car)} en voiture`} />
        <Tile label="Appels" value={n(t.phone)} change={delta(t.phone, p.phone)} />
        <Tile label="Abonnés" value={n(t.followers)} note={`+${n(t.new_followers)} · −${n(t.lost_followers)} sur la période`} />
        <Tile label="Visites en caisse" value={n(visits.last_30d)} note={`30 j · ${n(visits.promo_30d)} avec offre · ${n(visits.clients_30d)} client(s)`} />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Par jour">
          <Bars labels={a.daily.map((x) => x.day)}
            series={[{ name: "Fiche vue", color: "var(--viz-1)", values: a.daily.map((x) => x.views) }]}
            extra={(i) => `${n(a.daily[i].visitors)} personne(s) · ${n(a.daily[i].routes)} itinéraire(s) · ${n(a.daily[i].phone)} appel(s)`} />
        </Card>
        <Card title="D'où viennent les visites" hint="Personnes différentes, par point d'entrée.">
          <HBars total={sourceTotal} rows={SOURCES.map(([k, label]) => [label, a.sources[k] ?? 0] as [string, number]).sort((x, y) => y[1] - x[1])} />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Actions sur la fiche">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Kv k="Menu ouvert" v={n(t.menu)} />
            <Kv k="Photos vues" v={n(t.photos)} />
            <Kv k="Partages" v={n(t.shares)} />
            <Kv k="Avis lus" v={n(t.reviews_tab)} />
            <Kv k="Lien Google" v={n(t.google)} />
            <Kv k="Offres ouvertes" v={n(t.offer_clicks)} />
            <Kv k="Plats aimés" v={n(t.dish_likes)} />
            <Kv k="Note" v={t.rating ? `${String(t.rating).replace(".", ",")} / 5` : "—"} sub={`${n(t.reviews)} avis · ${n(t.unanswered)} sans réponse`} />
          </dl>
        </Card>
        <Card title="Heures de consultation">
          <Bars labels={a.hours.map((_, h) => `${h} h`)} dates={false} height="h-28" axis={["0 h", "12 h", "23 h"]}
            series={[{ name: "Fiche vue", color: "var(--viz-1)", values: a.hours }]} />
        </Card>
        <Card title="Public" hint="Personnes connectées, à partir de 5.">
          {au ? (
            <>
              <h3 className="text-xs font-medium text-slate-600 dark:text-zinc-400">Sexe</h3>
              <HBars total={au.total} rows={[["Femmes", au.female], ["Hommes", au.male], ["Autre", au.other], ["Non précisé", au.gender_unknown]]} />
              <h3 className="mt-4 text-xs font-medium text-slate-600 dark:text-zinc-400">Âge</h3>
              <HBars total={au.total} rows={[["15-17 ans", au.age_15_17], ["18-24 ans", au.age_18_24], ["25-34 ans", au.age_25_34], ["35 ans et plus", (au.age_35_49 ?? 0) + (au.age_50 ?? 0)], ["Non précisé", au.age_unknown]]} />
            </>
          ) : <Muted>Pas assez de personnes connectées pour l&apos;afficher.</Muted>}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Offres" hint="En cours, et terminées depuis moins de 30 jours.">
          {a.promos.length ? (
            <ul className="grid gap-2 text-sm">
              {a.promos.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0 dark:border-white/10">
                  <span className="min-w-0"><b className="font-medium break-words">{x.title}</b><br /><span className="text-xs text-slate-600 dark:text-zinc-400">{PROMO_KIND[x.kind] ?? x.kind} · {x.active ? "en cours" : "terminée"}</span></span>
                  <span className="shrink-0 tabular-nums">{n(x.clicks)} clic(s)</span>
                </li>
              ))}
            </ul>
          ) : <Muted>Aucune offre récente.</Muted>}
        </Card>
        <Card title="Stories" hint="30 derniers jours.">
          {a.stories.length ? (
            <ul className="grid gap-2 text-sm">
              {a.stories.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0 dark:border-white/10">
                  <span className="min-w-0 break-words">{x.caption || <i className="text-slate-500">(sans texte)</i>}<br /><span className="text-xs text-slate-600 dark:text-zinc-400">{dateTime(x.created_at)}</span></span>
                  <span className="shrink-0 text-right text-xs tabular-nums">{n(x.views)} vue(s)<br />{n(x.likes)} j&apos;aime · {n(x.clicks)} clic(s)</span>
                </li>
              ))}
            </ul>
          ) : <Muted>Aucune story récente.</Muted>}
        </Card>
        <Card title="Plats les plus aimés">
          {a.dishes.length ? (
            <ol className="grid gap-1.5 text-sm">
              {a.dishes.map((x) => <li key={x.dish} className="flex justify-between gap-3"><span className="min-w-0 truncate">{x.dish}</span><span className="shrink-0 tabular-nums">{n(x.likes)} ♥</span></li>)}
            </ol>
          ) : <Muted>Aucun « j&apos;aime » pour l&apos;instant.</Muted>}
        </Card>
      </div>
    </>
  );
}
