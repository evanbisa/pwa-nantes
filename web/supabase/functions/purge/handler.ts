/**
 * Ménage quotidien (droit à l'oubli, durées annoncées dans la page Confidentialité) :
 * notifications de plus de 60 jours, données par personne des statistiques de plus de 90 jours,
 * totaux de plus de 180 jours, plafond anti-triche de la veille, tentatives d'inscription de plus de 2 jours,
 * notifications de paiement Whop de plus de 30 jours, visites du site de plus de 13 mois,
 * stories finies depuis plus de 30 jours (avec leur photo, retirée du stockage).
 *
 * Aucun secret : la fonction n'efface que ce qui a dépassé sa durée de conservation ; un appel en trop ne fait
 * qu'avancer le ménage, et un seul passage par heure est effectué. Déclenchée chaque nuit par la base (pg_cron).
 */
export interface Deps {
  /** Date du dernier passage (null : jamais). */
  lastRun(job: string): Promise<Date | null>;
  markRun(job: string, at: Date): Promise<void>;
  /** Efface les lignes dont la colonne est antérieure à la limite ; renvoie le nombre de lignes effacées. */
  deleteOlder(table: string, column: string, before: string): Promise<number>;
  /** Stories finies avant la date (au plus « limit »). */
  expiredStories(before: string, limit: number): Promise<{ id: string; image_path: string | null }[]>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  deleteStories(ids: string[]): Promise<void>;
  now(): Date;
}

/** Durées de conservation (jours) : la page Confidentialité annonce les mêmes. */
export const RULES: { table: string; column: string; days: number; date?: boolean }[] = [
  { table: "notifications", column: "created_at", days: 60 },
  { table: "merchant_visitors", column: "day", days: 90, date: true },
  { table: "merchant_event_visitors", column: "day", days: 90, date: true },
  { table: "merchant_view_hours", column: "day", days: 90, date: true },
  { table: "story_viewers", column: "viewed_at", days: 90 },
  { table: "promo_clicks", column: "clicked_at", days: 90 },
  { table: "merchant_stats", column: "day", days: 180, date: true },
  { table: "visit_budget", column: "day", days: 2, date: true },
  { table: "signup_attempts", column: "created_at", days: 2 },
  { table: "whop_events", column: "received_at", days: 30 },
  { table: "site_events", column: "day", days: 395, date: true },   // visites du site : 13 mois
];
export const STORY_KEEP_DAYS = 30;
const JOB = "purge";
const MIN_INTERVAL = 60 * 60 * 1000;
const BATCH = 100, MAX_BATCHES = 20;

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 864e5);

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  if (req.method !== "POST") return json(405, { error: "method", message: "Méthode non autorisée." });

  const now = deps.now();
  try {
    const last = await deps.lastRun(JOB);
    if (last && now.getTime() - last.getTime() < MIN_INTERVAL) return json(200, { skipped: true });
    await deps.markRun(JOB, now);

    const deleted: Record<string, number> = {};
    for (const r of RULES) {
      const limit = daysAgo(now, r.days);
      deleted[r.table] = await deps.deleteOlder(r.table, r.column, r.date ? limit.toISOString().slice(0, 10) : limit.toISOString());
    }
    // Stories finies depuis plus de 30 jours : photo retirée du stockage, puis la story (vues et « j'aime » en cascade)
    let stories = 0, files = 0;
    const before = daysAgo(now, STORY_KEEP_DAYS).toISOString();
    for (let i = 0; i < MAX_BATCHES; i++) {
      const batch = await deps.expiredStories(before, BATCH);
      if (!batch.length) break;
      const paths = batch.map((s) => s.image_path).filter((p): p is string => !!p);
      if (paths.length) { await deps.removeFiles("stories", paths); files += paths.length; }
      await deps.deleteStories(batch.map((s) => s.id));
      stories += batch.length;
      if (batch.length < BATCH) break;
    }
    deleted.stories = stories;
    return json(200, { deleted, files });
  } catch (e) {
    console.error("purge: ménage impossible", e);
    return json(500, { error: "server", message: "Ménage impossible pour le moment." });
  }
}
