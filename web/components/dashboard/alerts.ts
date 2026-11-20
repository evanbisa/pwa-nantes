import { DB_LIMIT, STORAGE_LIMIT, hoursSince, n, plural, type Data } from "./data";

export type Tab = "overview" | "users" | "restaurants" | "bugs" | "server";
export type Alert = { tone: "critical" | "warning" | "info"; text: string; tab: Tab };

/** « À surveiller » : ce qui demande l'attention de l'équipe, du plus grave au moins grave. */
export function alerts(d: Data): Alert[] {
  const out: Alert[] = [];
  const h = d.health;
  const open = d.error_list.filter((e) => e.open);
  const reappeared = d.error_list.filter((e) => e.reappeared).length;

  if (d.errors.new_24h) out.push({ tone: "critical", tab: "bugs", text: `${plural(d.errors.new_24h, "nouveau bug", "nouveaux bugs")} dans les dernières 24 h` });
  if (reappeared) out.push({ tone: "critical", tab: "bugs", text: reappeared > 1 ? `${n(reappeared)} bugs marqués corrigés sont revenus` : "Un bug marqué corrigé est revenu" });
  const cronFailed = (h.cron ?? []).filter((c) => c.last_status === "failed" || c.failures_7d > 0);
  if (cronFailed.length) out.push({ tone: "critical", tab: "server", text: `Tâche planifiée en échec : ${cronFailed.map((c) => c.job).join(", ")}` });
  if (h.maintenance && hoursSince(h.maintenance.purge) > 26) out.push({ tone: "critical", tab: "server", text: "Le ménage nocturne n'a pas tourné depuis plus de 26 h" });
  if (d.subscriptions_more.past_due) out.push({ tone: "critical", tab: "restaurants", text: `${plural(d.subscriptions_more.past_due, "abonnement", "abonnements")} avec un paiement refusé` });

  const dbUse = (h.db_bytes ?? 0) / DB_LIMIT;
  if (dbUse >= 0.7) out.push({ tone: dbUse >= 0.9 ? "critical" : "warning", tab: "server", text: `Base de données remplie à ${Math.round(dbUse * 100)} % (offre gratuite : 500 Mo)` });
  const stUse = (h.storage ?? []).reduce((s, b) => s + b.bytes, 0) / STORAGE_LIMIT;
  if (stUse >= 0.7) out.push({ tone: stUse >= 0.9 ? "critical" : "warning", tab: "server", text: `Stockage des photos rempli à ${Math.round(stUse * 100)} % (offre gratuite : 1 Go)` });
  const q = h.quota_today;
  if (q && q.site_events >= q.site_events_max * 0.8) out.push({ tone: "warning", tab: "server", text: `Visites du jour proches du plafond de comptage (${n(q.site_events)} / ${n(q.site_events_max)})` });

  if (d.reported_reviews.length) out.push({ tone: "warning", tab: "restaurants", text: `${plural(d.reported_reviews.length, "avis signalé", "avis signalés")} à vérifier` });
  if (open.length && !d.errors.new_24h) out.push({ tone: "warning", tab: "bugs", text: `${plural(open.length, "bug", "bugs")} à traiter sur la période` });
  const stuck = d.merchants_pending.filter((m) => m.status !== "suspended" && hoursSince(m.created_at) > 72);
  if (stuck.length) out.push({ tone: "info", tab: "restaurants", text: `${plural(stuck.length, "restaurateur inscrit", "restaurateurs inscrits")} depuis plus de 3 jours, pas encore sur la carte` });
  if (d.subscriptions_more.cancelling) out.push({ tone: "info", tab: "restaurants", text: `${plural(d.subscriptions_more.cancelling, "abonnement résilié", "abonnements résiliés")} à l'échéance` });
  if (h.whop && !h.whop.live) out.push({ tone: "info", tab: "server", text: "Paiement Whop en mode démonstration (aucun paiement réel)" });
  return out;
}
