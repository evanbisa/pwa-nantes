/** Données renvoyées par la base (team_dashboard) et petites fonctions d'affichage du tableau de bord de l'équipe. */

type Day = { day: string };
type Counts = Record<string, number>;

export type ErrorItem = {
  fingerprint: string; kind: "js" | "promise" | "server"; app: "carte" | "app";
  message: string; source: string | null; stack: string | null;
  occurrences: number; signed_in: number; days_seen: number; first_at: string; last_at: string;
  status: "resolved" | "ignored" | null; triaged_at: string | null; open: boolean; reappeared: boolean;
  platforms: Counts; browsers: Counts; pages: Counts; releases: Counts; spark: number[];
};

export type PendingMerchant = {
  name: string; status: "no_fiche" | "draft" | "awaiting_docs" | "suspended"; created_at: string; email: string | null;
  siret: boolean; docs: boolean; honor: boolean; subscription: string | null;
};

export type Activity = {
  at: string; label: string | null; detail: string | null;
  type: "client_signup" | "merchant_signup" | "published" | "review" | "promo" | "story" | "qr_visit" | "subscription" | "new_bug";
};

export type Data = {
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
  audience: { female: number; male: number; other: number; unknown: number; ages: Counts };

  health: {
    db_bytes?: number;
    storage?: { bucket: string; files: number; bytes: number }[];
    tables?: { name: string; bytes: number; rows: number }[];
    cron?: { job: string; schedule: string; active: boolean; last_status: string | null; last_start: string | null; last_message: string | null; failures_7d: number }[];
    maintenance?: Record<string, string>;
    whop?: { live: boolean; last_event: string | null; events_30d: number };
    signup_attempts_24h?: { check: number; signup: number };
    users_unconfirmed?: number;
    quota_today?: { site_events: number; site_events_max: number; client_errors: number; client_errors_max: number };
  };
  previous: { visitors: number; clients: number; merchants: number; views: number; reviews: number; qr_visits: number; errors: number };
  loyalty: { returning: number; avg_days: number; today: number; last_7: number; last_30: number };
  new_visitors_daily: (Day & { new: number })[];
  weekdays: number[];
  view_hours: number[];
  accounts_more: { total: number; unconfirmed: number; signed_in_7d: number; signed_in_30d: number; app_installed: number; notify_promos: number; with_follow: number };
  clients_funnel: { new: number; activated: number; qr_visit: number };
  merchant_funnel: { accounts: number; fiche: number; siret: number; docs: number; subscribed: number; published: number; suspended: number };
  merchants_pending: PendingMerchant[];
  subscriptions_more: { past_due: number; cancelling: number; renew_7d: number; plans: Counts };
  content: {
    promos_active: number; promos_period: number; stories_active: number; stories_period: number; menu_scans: number;
    reviews_period: number; rating_period: number | null; replied_period: number; follows_period: number; likes_period: number;
    notifs_period: number; pushed_period: number; qr_visits: number; qr_with_promo: number;
  };
  reported_reviews: { id: string; merchant: string; rating: number; comment: string | null; author_name: string | null; created_at: string; reported_at: string }[];
  errors: { occurrences: number; server: number; distinct: number; new_24h: number; today: number };
  errors_daily: (Day & { js: number; server: number })[];
  error_list: ErrorItem[];
  activity: Activity[];
};

/** Offre gratuite de Supabase : base 500 Mo, stockage 1 Go. */
export const DB_LIMIT = 500 * 1024 ** 2;
export const STORAGE_LIMIT = 1024 ** 3;
export const SUPABASE_PROJECT = "fnypgfyxbyaqrnklhjxc";
export const REPO = "https://github.com/evanbisa/pwa-nantes";

const nf = new Intl.NumberFormat("fr-FR");
export const n = (v: number | null | undefined) => nf.format(v ?? 0);
export const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
export const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
export const dayLabel = (iso: string, long = false) =>
  new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function bytes(v: number | undefined) {
  if (v === undefined) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let i = 0, x = v;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: x < 10 && i > 0 ? 1 : 0 }).format(x)} ${units[i]}`;
}

/** « 1 bug », « 3 bugs » (nombre écrit à la française). */
export const plural = (count: number, one: string, many: string) => `${n(count)} ${count > 1 ? many : one}`;

/** « il y a 5 min », « il y a 3 h », « il y a 2 j ». */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "jamais";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
export const hoursSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 3.6e6 : Infinity);

/** Évolution par rapport à la période précédente : null si rien à comparer. */
export function delta(now: number, before: number) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 100);
}
