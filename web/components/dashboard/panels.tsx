"use client";

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, ExternalLink, Info } from "lucide-react";
import {
  DB_LIMIT, REPO, STORAGE_LIMIT, SUPABASE_PROJECT, ago, bytes, dateTime, delta, euros, hoursSince, n, pct,
  type Activity, type Data, type PendingMerchant,
} from "./data";
import { ModerationButtons } from "./moderation";
import type { Alert } from "./alerts";
import { go, restaurantHref, sectionHref } from "./nav";
import { refreshAll } from "./store";
import { Bars, Card, Funnel, HBars, Kv, Meter, Muted, Pill, Tile } from "./ui";

const grid2 = "mt-3 grid gap-3 lg:grid-cols-2";
const grid3 = "mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3";
const rating = (v: number | null) => (v ? `${String(v).replace(".", ",")} / 5` : "—");

/* ===================================== Vue d'ensemble ===================================== */

export function Overview({ d, alerts }: { d: Data; alerts: Alert[] }) {
  const p = d.previous;
  return (
    <>
      <Card title="À surveiller" hint="Calculé à chaque actualisation, du plus urgent au moins urgent.">
        {alerts.length ? (
          <ul className="grid gap-2">
            {alerts.map((a) => (
              <li key={a.text}>
                <button type="button" onClick={() => go(a.tab)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ring-1 ring-slate-200 hover:bg-slate-50 dark:ring-white/10 dark:hover:bg-white/[0.06]">
                  <AlertIcon tone={a.tone} />
                  <span className="min-w-0 flex-1">{a.text}</span>
                  <span className="sr-only">{a.tone === "critical" ? "urgent" : a.tone === "warning" ? "à surveiller" : "pour info"}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-5 w-5 text-[#0ca30c]" aria-hidden /> Rien à signaler : pas de nouveau bug, serveur en forme.</p>
        )}
      </Card>

      <section aria-label="Chiffres clés" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile href={sectionHref("users")} label={`Visiteurs (${d.days} j)`} value={n(d.visits.visitors)} change={delta(d.visits.visitors, p.visitors)} />
        <Tile href={sectionHref("users")} label="Nouveaux comptes" value={n(d.accounts.new_period)} change={delta(d.accounts.new_period, p.clients)} note={`${n(d.accounts.clients)} clients au total`} />
        <Tile href={sectionHref("directory")} label="Restaurants en ligne" value={n(d.restaurants.published)} note={`${n(d.merchants_pending.length)} en cours d'inscription`} />
        <Tile href={sectionHref("revenue")} label="Revenu mensuel (HT)" value={euros(d.subscriptions.mrr_cents)} note={`${n(d.subscriptions.paid)} payé(s) · ${n(d.subscriptions.demo)} démo`} />
        <Tile href={sectionHref("restaurants")} label="Visites en caisse (QR)" value={n(d.content.qr_visits)} change={delta(d.content.qr_visits, p.qr_visits)} />
        <Tile href={sectionHref("bugs")} label="Bugs (occurrences)" value={n(d.errors.occurrences)} change={delta(d.errors.occurrences, p.errors)} upIsGood={false} note={`${n(d.errors.distinct)} bug(s) différent(s)`} />
      </section>

      <div className={grid2}>
        <Card title="Visiteurs par jour" hint="Appareils différents, avec l'accord « statistiques » des cookies.">
          <VisitorsChart d={d} />
        </Card>
        <Card title="Nouveaux comptes par jour">
          <Bars
            labels={d.signups_daily.map((x) => x.day)}
            series={[
              { name: "Clients", color: "var(--viz-1)", values: d.signups_daily.map((x) => x.clients) },
              { name: "Restaurateurs", color: "var(--viz-2)", values: d.signups_daily.map((x) => x.merchants) },
            ]}
          />
        </Card>
      </div>

      <div className={grid2}>
        <Card title="Activité récente" hint="30 derniers jours, la plus récente en haut.">
          <ActivityFeed items={d.activity} />
        </Card>
        <Card title="Utilisation des fiches" hint={`${d.days} derniers jours`}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Kv k="Fiches vues" v={n(d.engagement.views)} />
            <Kv k="Itinéraires" v={n(d.engagement.directions)} />
            <Kv k="Appels" v={n(d.engagement.calls)} />
            <Kv k="Menus ouverts" v={n(d.engagement.menus)} />
            <Kv k="Stories vues" v={n(d.engagement.stories)} />
            <Kv k="Offres ouvertes" v={n(d.engagement.promo_clicks)} />
          </dl>
          <TopMerchants d={d} />
        </Card>
      </div>
    </>
  );
}

function AlertIcon({ tone }: { tone: Alert["tone"] }) {
  if (tone === "critical") return <AlertOctagon className="h-5 w-5 shrink-0 text-[#d03b3b]" aria-hidden />;
  if (tone === "warning") return <AlertTriangle className="h-5 w-5 shrink-0 text-[#c98a00] dark:text-[#fab219]" aria-hidden />;
  return <Info className="h-5 w-5 shrink-0 text-[var(--viz-1)]" aria-hidden />;
}

function VisitorsChart({ d }: { d: Data }) {
  const fresh = d.new_visitors_daily.map((x) => x.new);
  return (
    <Bars
      labels={d.visits_daily.map((x) => x.day)}
      series={[
        { name: "Nouveaux", color: "var(--viz-1)", values: fresh },
        { name: "Déjà venus", color: "var(--viz-2)", values: d.visits_daily.map((x, i) => Math.max(0, x.visitors - (fresh[i] ?? 0))) },
      ]}
      extra={(i) => `dont ${n(d.visits_daily[i].app)} depuis l'icône`}
    />
  );
}

const ACTIVITY: Record<Activity["type"], (a: Activity) => [string, string]> = {
  client_signup: () => ["👤", "Nouveau compte client"],
  merchant_signup: () => ["🧑‍🍳", "Nouveau compte restaurateur"],
  published: (a) => ["🟢", `Mise en ligne : ${a.label}`],
  review: (a) => ["⭐", `Avis ${a.detail}★ sur ${a.label}`],
  promo: (a) => ["🏷️", `Offre « ${a.detail} » · ${a.label}`],
  story: (a) => ["📸", `Story publiée · ${a.label}`],
  qr_visit: (a) => ["✅", `Visite validée en caisse · ${a.label}${a.detail ? ` (${a.detail})` : ""}`],
  subscription: (a) => ["💳", `Abonnement ${a.detail ?? ""} · ${a.label}`],
  new_bug: (a) => ["🐞", `Nouveau bug : ${a.detail}`],
};

function ActivityFeed({ items }: { items: Activity[] }) {
  if (!items.length) return <Muted>Rien depuis 30 jours.</Muted>;
  return (
    <ul className="-my-1 max-h-[26rem] overflow-y-auto pr-1">
      {items.map((a, i) => {
        const [icon, text] = ACTIVITY[a.type]?.(a) ?? ["•", a.type];
        return (
          <li key={i} className="flex items-start gap-3 border-t border-slate-200 py-2 text-sm first:border-t-0 dark:border-white/10">
            <span aria-hidden className="w-5 text-center">{icon}</span>
            <span className="min-w-0 flex-1 break-words">{text}</span>
            <time dateTime={a.at} title={dateTime(a.at)} className="shrink-0 text-xs text-slate-500 dark:text-zinc-400">{ago(a.at)}</time>
          </li>
        );
      })}
    </ul>
  );
}

function TopMerchants({ d }: { d: Data }) {
  return (
    <>
      <h3 className="mt-6 text-sm font-semibold">Restaurants les plus vus</h3>
      {d.top_merchants.length ? (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400"><th className="py-1.5 font-medium">Restaurant</th><th className="py-1.5 text-right font-medium">Vues</th><th className="py-1.5 text-right font-medium">Abonnés</th></tr></thead>
          <tbody>
            {d.top_merchants.map((m) => (
              <tr key={m.name} className="border-t border-slate-200 dark:border-white/10">
                <td className="py-2">{m.name}{m.is_test && <span className="ml-2"><Pill>test</Pill></span>}</td>
                <td className="py-2 text-right tabular-nums">{n(m.views)}</td>
                <td className="py-2 text-right tabular-nums">{n(m.followers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Aucun restaurant en ligne pour l&apos;instant.</p>}
    </>
  );
}

/* ===================================== Utilisateurs ===================================== */

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function Users({ d }: { d: Data }) {
  const v = d.visits, l = d.loyalty, a = d.accounts_more;
  const platformTotal = v.ios + v.android + v.desktop;
  return (
    <>
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Visiteurs aujourd'hui" value={n(l.today)} note={`${n(l.last_7)} sur 7 j · ${n(l.last_30)} sur 30 j`} />
        <Tile label="Visiteurs revenus" value={`${pct(l.returning, v.visitors)} %`} note={`${n(l.returning)} venus au moins 2 jours · ${String(l.avg_days).replace(".", ",")} j en moyenne`} />
        <Tile label="Comptes" value={n(a.total)} note={`${n(d.accounts.clients)} clients · ${n(d.accounts.merchants)} restaurateurs · ${n(a.unconfirmed)} non confirmé(s)`} />
        <Tile label="Connectés (7 j)" value={n(a.signed_in_7d)} note={`${n(a.signed_in_30d)} sur 30 j (dernière connexion)`} />
      </section>

      <div className={grid2}>
        <Card title="Visiteurs par jour" hint="Nouveaux appareils et appareils déjà venus (accord « statistiques »).">
          <VisitorsChart d={d} />
        </Card>
        <Card title="Nouveaux comptes par jour">
          <Bars
            labels={d.signups_daily.map((x) => x.day)}
            series={[
              { name: "Clients", color: "var(--viz-1)", values: d.signups_daily.map((x) => x.clients) },
              { name: "Restaurateurs", color: "var(--viz-2)", values: d.signups_daily.map((x) => x.merchants) },
            ]}
          />
        </Card>
      </div>

      <div className={grid3}>
        <Card title="Des visiteurs aux clients actifs" hint={`${d.days} derniers jours. « Actif » : suit un restaurant, a donné un avis, aimé un plat ou une story, ou validé une visite.`}>
          <Funnel steps={[["Visiteurs (avec accord)", v.visitors], ["Comptes clients créés", d.clients_funnel.new], ["Devenus actifs", d.clients_funnel.activated], ["Visite validée en caisse", d.clients_funnel.qr_visit]]} />
        </Card>
        <Card title="Appareils" hint={`${n(platformTotal)} visiteurs sur la période`}>
          <HBars total={platformTotal} rows={[["iPhone, iPad", v.ios], ["Android", v.android], ["Ordinateur", v.desktop]]} />
        </Card>
        <Card title="Écran d'accueil" hint={`${n(v.app)} visiteur(s) ont ouvert FlashMiam depuis l'icône · ${n(a.app_installed)} compte(s) l'ont installé`}>
          <HBars total={Math.max(d.install.shown, 1)} rows={[["Proposé", d.install.shown], ["Accepté (Android)", d.install.accepted], ["Installé", d.install.installed]]} />
        </Card>
      </div>

      <div className={grid2}>
        <Card title="Visites selon le jour" hint="Visiteurs par jour de la semaine, sur la période.">
          <Bars labels={WEEKDAYS} dates={false} height="h-32" axis={["Lun.", "Jeu.", "Dim."]}
            series={[{ name: "Visiteurs", color: "var(--viz-1)", values: d.weekdays }]} />
        </Card>
        <Card title="Heures de consultation des fiches" hint="Fiches ouvertes selon l'heure (heure de Paris).">
          <Bars labels={d.view_hours.map((_, h) => `${h} h`)} dates={false} height="h-32" axis={["0 h", "12 h", "23 h"]}
            series={[{ name: "Fiches vues", color: "var(--viz-1)", values: d.view_hours }]} />
        </Card>
      </div>

      <div className={grid3}>
        <Card title="Clients" hint="Réponses facultatives à l'inscription.">
          <h3 className="text-xs font-medium text-slate-600 dark:text-zinc-400">Sexe</h3>
          <HBars total={d.accounts.clients} rows={[["Femmes", d.audience.female], ["Hommes", d.audience.male], ["Autre", d.audience.other], ["Non précisé", d.audience.unknown]]} />
        </Card>
        <Card title="Âge des clients">
          <HBars total={d.accounts.clients} rows={[["15-17 ans", d.audience.ages["15-17"]], ["18-24 ans", d.audience.ages["18-24"]], ["25-34 ans", d.audience.ages["25-34"]], ["35 ans et plus", d.audience.ages["35+"]], ["Non précisé", d.audience.ages.unknown]]} />
        </Card>
        <Card title="Comptes et alertes">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Kv k="Avec Google" v={n(d.accounts.google)} />
            <Kv k="Nouveaux (7 j)" v={n(d.accounts.new_7d)} />
            <Kv k="Appareils avec alertes" v={n(d.accounts.push_devices)} />
            <Kv k="Alertes promos activées" v={n(a.notify_promos)} />
            <Kv k="Suivent ≥ 1 restaurant" v={n(a.with_follow)} sub={`${pct(a.with_follow, d.accounts.clients)} %`} />
            <Kv k="Connectés sur le site" v={n(v.signed_in)} sub="visiteurs" />
          </dl>
        </Card>
      </div>
    </>
  );
}

/* ===================================== Restaurants ===================================== */

const STATUS_LABEL: Record<PendingMerchant["status"], string> = {
  no_fiche: "Pas de fiche", draft: "Brouillon", awaiting_docs: "Attend ses justificatifs", suspended: "Suspendue",
};
/** Prochaine étape qui manque à un restaurateur pour apparaître sur la carte. */
function nextStep(m: PendingMerchant) {
  if (m.status === "suspended") return "Fiche suspendue (modération)";
  if (m.status === "no_fiche") return "Créer sa fiche (SIRET)";
  if (!m.siret) return "Vérifier son SIRET";
  if (m.subscription !== "active" && m.subscription !== "past_due") return "Choisir un abonnement";
  if (!m.docs) return "Déposer Kbis et attestation d'hygiène";
  if (!m.honor) return "Attestation sur l'honneur";
  return "Compléter et publier la fiche";
}

export function Restaurants({ d }: { d: Data }) {
  const f = d.merchant_funnel, s = d.subscriptions_more, c = d.content;
  return (
    <>
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Restaurants en ligne" value={n(d.restaurants.published)} note={`${n(d.restaurants.test)} fiche(s) de test à part`} />
        <Tile label="Revenu mensuel (HT)" value={euros(d.subscriptions.mrr_cents)} note={`${n(d.subscriptions.paid)} abonnement(s) payé(s) · ${n(d.subscriptions.demo)} en démo`} />
        <Tile label="Visites en caisse (QR)" value={n(c.qr_visits)} change={delta(c.qr_visits, d.previous.qr_visits)} note={`${n(c.qr_with_promo)} avec une offre`} />
        <Tile label="Avis publiés" value={n(c.reviews_period)} change={delta(c.reviews_period, d.previous.reviews)} note={`note ${rating(c.rating_period)} · ${pct(c.replied_period, c.reviews_period)} % avec réponse`} />
      </section>

      <div className={grid2}>
        <Card title="De l'inscription à la carte" hint="Restaurateurs (hors fiches de test), étape par étape.">
          <Funnel steps={[["Comptes restaurateur", f.accounts], ["Fiche créée", f.fiche], ["SIRET vérifié", f.siret], ["Abonnement actif", f.subscribed], ["Justificatifs déposés", f.docs], ["En ligne sur la carte", f.published]]} />
          {f.suspended > 0 && <p className="mt-3 text-xs text-slate-600 dark:text-zinc-400">{n(f.suspended)} fiche(s) suspendue(s).</p>}
        </Card>
        <Card title="Abonnements" action={<a href={sectionHref("revenue")} className="shrink-0 text-sm font-medium text-[var(--viz-1)] hover:underline">Revenus →</a>}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Kv k="Actifs" v={n(d.subscriptions.active)} />
            <Kv k="Paiement refusé" v={n(s.past_due)} />
            <Kv k="Résiliés à l'échéance" v={n(s.cancelling)} />
            <Kv k="Renouvelés sous 7 j" v={n(s.renew_7d)} />
            <Kv k="Paiement Whop" v={d.health.whop ? (d.health.whop.live ? "Réel" : "Démo") : "—"} />
          </dl>
          {Object.keys(s.plans).length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-medium text-slate-600 dark:text-zinc-400">Formules</h3>
              <HBars total={d.subscriptions.active} rows={Object.entries(s.plans).sort((a, b) => b[1] - a[1])} />
            </>
          )}
        </Card>
      </div>

      <Card className="mt-3" title="À relancer" hint="Restaurateurs inscrits pas encore sur la carte, le plus ancien en haut."
        action={<a href={sectionHref("directory")} className="shrink-0 text-sm font-medium text-[var(--viz-1)] hover:underline">Toutes les fiches →</a>}>
        {d.merchants_pending.length ? (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400">
                <th className="py-1.5 font-medium">Restaurant</th><th className="py-1.5 font-medium">État</th><th className="py-1.5 font-medium">Étape suivante</th>
                <th className="py-1.5 font-medium">Inscrit</th><th className="py-1.5 font-medium">Contact</th>
              </tr></thead>
              <tbody>
                {d.merchants_pending.map((m, i) => (
                  <tr key={i} className="border-t border-slate-200 align-top dark:border-white/10">
                    <td className="py-2 pr-3">{m.id ? <a href={restaurantHref(m.id)} className="font-medium text-[var(--viz-1)] hover:underline">{m.name}</a> : m.name}</td>
                    <td className="py-2 pr-3"><Pill tone={m.status === "suspended" ? "critical" : m.status === "awaiting_docs" ? "warning" : "neutral"}>{STATUS_LABEL[m.status] ?? m.status}</Pill></td>
                    <td className="py-2 pr-3">{nextStep(m)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap" title={dateTime(m.created_at)}>{ago(m.created_at)}{hoursSince(m.created_at) > 72 && m.status !== "suspended" && <span className="sr-only"> (plus de 3 jours)</span>}</td>
                    <td className="py-2">{m.email ? <a className="text-[var(--viz-1)] underline-offset-2 hover:underline" href={`mailto:${m.email}`}>{m.email}</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Muted>Tous les restaurateurs inscrits sont sur la carte.</Muted>}
      </Card>

      <div className={grid2}>
        <Card title="Contenu publié" hint={`${d.days} derniers jours (« en cours » : visible maintenant)`}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Kv k="Offres publiées" v={n(c.promos_period)} sub={`${n(c.promos_active)} en cours`} />
            <Kv k="Stories publiées" v={n(c.stories_period)} sub={`${n(c.stories_active)} en cours`} />
            <Kv k="Cartes lues sur photo" v={n(c.menu_scans)} />
            <Kv k="Nouveaux abonnés" v={n(c.follows_period)} />
            <Kv k="« J'aime »" v={n(c.likes_period)} />
            <Kv k="Notifications" v={n(c.notifs_period)} sub={`${pct(c.pushed_period, c.notifs_period)} % en alerte`} />
          </dl>
        </Card>
        <Card title="Avis signalés" hint="Signalés par les restaurateurs. « Garder » lève le signalement ; « Supprimer » retire l'avis.">
          {d.reported_reviews.length ? (
            <ul className="grid gap-3">
              {d.reported_reviews.map((r) => (
                <li key={r.id} className="rounded-xl p-3 text-sm ring-1 ring-slate-200 dark:ring-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <a href={restaurantHref(r.merchant_id)} className="font-semibold text-[var(--viz-1)] hover:underline">{r.merchant}</a>
                    <span className="text-xs text-slate-600 dark:text-zinc-400">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · signalé {ago(r.reported_at)}</span>
                  </div>
                  <p className="mt-1 break-words">{r.comment || <i className="text-slate-500">(sans commentaire)</i>}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{r.author_name} · avis du {dateTime(r.created_at)}</p>
                  <ModerationButtons reviewId={r.id} reported onDone={refreshAll} />
                </li>
              ))}
            </ul>
          ) : <Muted>Aucun avis signalé.</Muted>}
        </Card>
      </div>

      <Card className="mt-3" title="Utilisation des fiches" hint={`${d.days} derniers jours`}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Kv k="Fiches vues" v={n(d.engagement.views)} />
          <Kv k="Itinéraires" v={n(d.engagement.directions)} />
          <Kv k="Appels" v={n(d.engagement.calls)} />
          <Kv k="Menus ouverts" v={n(d.engagement.menus)} />
          <Kv k="Stories vues" v={n(d.engagement.stories)} />
          <Kv k="Offres ouvertes" v={n(d.engagement.promo_clicks)} />
        </dl>
        <TopMerchants d={d} />
      </Card>
    </>
  );
}

/* ===================================== Serveur ===================================== */

const LINKS: [string, string][] = [
  ["Supabase : journaux des fonctions serveur", `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/functions`],
  ["Supabase : journaux de la base et de l'API", `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/logs/explorer`],
  ["Supabase : utilisation et quotas", `https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/settings/billing/usage`],
  ["Vercel : publications du site", "https://vercel.com/dashboard"],
  ["GitHub : vérifications automatiques et sauvegardes", `${REPO}/actions`],
];

export function Server({ d }: { d: Data }) {
  const h = d.health;
  const storageTotal = h.storage?.reduce((s, b) => s + b.bytes, 0);
  const q = h.quota_today;
  return (
    <>
      <div className={grid2}>
        <Card title="Espace utilisé" hint="Limites de l'offre gratuite de Supabase.">
          <div className="grid gap-4">
            <Meter label="Base de données" used={h.db_bytes} max={DB_LIMIT} format={bytes} />
            <Meter label="Stockage (photos, justificatifs)" used={storageTotal} max={STORAGE_LIMIT} format={bytes} />
          </div>
          {h.storage && h.storage.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400"><th className="py-1.5 font-medium">Espace de stockage</th><th className="py-1.5 text-right font-medium">Fichiers</th><th className="py-1.5 text-right font-medium">Taille</th></tr></thead>
              <tbody>{h.storage.map((b) => <tr key={b.bucket} className="border-t border-slate-200 dark:border-white/10"><td className="py-1.5">{b.bucket}</td><td className="py-1.5 text-right tabular-nums">{n(b.files)}</td><td className="py-1.5 text-right tabular-nums">{bytes(b.bytes)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title="Plus grosses tables">
          {h.tables?.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-600 dark:text-zinc-400"><th className="py-1.5 font-medium">Table</th><th className="py-1.5 text-right font-medium">Lignes (env.)</th><th className="py-1.5 text-right font-medium">Taille</th></tr></thead>
              <tbody>{h.tables.map((t) => <tr key={t.name} className="border-t border-slate-200 dark:border-white/10"><td className="py-1.5 font-mono text-xs">{t.name}</td><td className="py-1.5 text-right tabular-nums">{n(t.rows)}</td><td className="py-1.5 text-right tabular-nums">{bytes(t.bytes)}</td></tr>)}</tbody>
            </table>
          ) : <Muted>Indisponible.</Muted>}
        </Card>
      </div>

      <div className={grid3}>
        <Card title="Tâches planifiées" hint="Ménage nocturne (données périmées, comptes jamais confirmés…).">
          {h.cron?.length ? (
            <ul className="grid gap-3 text-sm">
              {h.cron.map((c) => (
                <li key={c.job}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="font-mono text-xs font-semibold">{c.job}</b>
                    {!c.active ? <Pill>désactivée</Pill> : c.last_status === "failed" ? <Pill tone="critical">échec</Pill> : c.last_status === "succeeded" ? <Pill tone="good">réussie</Pill> : <Pill>{c.last_status ?? "jamais lancée"}</Pill>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">
                    <code>{c.schedule}</code> (UTC) · dernière : {ago(c.last_start)} · {n(c.failures_7d)} échec(s) sur 7 j
                  </p>
                  {c.last_status === "failed" && c.last_message && <p className="mt-1 font-mono text-xs break-words text-[#a82626] dark:text-[#ff9b9b]">{c.last_message}</p>}
                </li>
              ))}
            </ul>
          ) : <Muted>Aucune tâche lisible.</Muted>}
          {h.maintenance && (
            <p className="mt-4 text-sm">
              Dernier ménage effectué : <b className="font-semibold">{ago(h.maintenance.purge)}</b>{" "}
              {hoursSince(h.maintenance.purge) > 26 ? <Pill tone="critical">en retard</Pill> : <Pill tone="good">à l&apos;heure</Pill>}
            </p>
          )}
        </Card>
        <Card title="Paiement et inscriptions">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Kv k="Whop" v={h.whop ? (h.whop.live ? "Paiement réel" : "Démonstration") : "—"} />
            <Kv k="Dernière notif. Whop" v={h.whop ? ago(h.whop.last_event) : "—"} />
            <Kv k="Notifs Whop (30 j)" v={n(h.whop?.events_30d)} />
            <Kv k="Comptes non confirmés" v={n(h.users_unconfirmed)} />
            <Kv k="Inscriptions (24 h)" v={n(h.signup_attempts_24h?.signup)} sub="tentatives" />
            <Kv k="Vérif. d'e-mail (24 h)" v={n(h.signup_attempts_24h?.check)} />
          </dl>
        </Card>
        <Card title="Plafonds du jour" hint="Protection contre les abus : au-delà, plus rien n'est compté jusqu'à demain.">
          {q ? (
            <div className="grid gap-4">
              <Meter label="Visites comptées" used={q.site_events} max={q.site_events_max} format={n} />
              <Meter label="Bugs différents" used={q.client_errors} max={q.client_errors_max} format={n} />
            </div>
          ) : <Muted>Indisponible.</Muted>}
        </Card>
      </div>

      <Card className="mt-3" title="Liens utiles">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {LINKS.map(([label, href]) => (
            <li key={href}><ExtLink href={href}>{label}</ExtLink></li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export const ExtLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[var(--viz-1)] underline-offset-2 hover:underline">
    {children} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
  </a>
);
