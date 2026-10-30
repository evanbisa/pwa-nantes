/**
 * Alertes « push » : transmet aux appareils abonnés les notifications que la base vient de créer
 * (promo ou story d'un restaurant suivi, nouvel avis, réponse à un avis).
 *
 * Aucun secret partagé : la fonction n'envoie que des notifications existantes, récentes et pas encore
 * transmises (réservées une par une par la base), à leurs seuls destinataires. Un appel abusif ne peut
 * donc rien envoyer de plus que ce que la base a déjà décidé.
 */
import { b64u, encryptPayload, generateVapidKeys, type VapidKeys, vapidAuthorization } from "./webpush.ts";
import { corsHeaders } from "../_shared/cors.ts";

export interface PendingNotification {
  id: string; user_id: string; merchant_id: string | null; kind: string; title: string; body: string | null;
}
export interface Subscription { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface Deps {
  getKeys(): Promise<VapidKeys | null>;
  /** Enregistre les clés si aucune n'existe encore (sans écraser celles d'un appel concurrent). */
  saveKeys(keys: VapidKeys): Promise<void>;
  claimPending(merchantId: string | null): Promise<PendingNotification[]>;
  subscriptionsFor(userIds: string[]): Promise<Subscription[]>;
  removeSubscription(id: string): Promise<void>;
  touchSubscription(id: string): Promise<void>;
  post(url: string, init: RequestInit): Promise<{ status: number }>;
  /** Services d'alertes autorisés (adresse de l'appareil) : jamais une adresse quelconque. */
  allowEndpoint(url: string): boolean;
  subject: string;
}

export const DEFAULT_ENDPOINTS =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;


/** Clés du serveur : créées au premier besoin, puis toujours relues depuis la base (une seule paire). */
export async function ensureKeys(deps: Deps): Promise<VapidKeys> {
  const existing = await deps.getKeys();
  if (existing) return existing;
  await deps.saveKeys(await generateVapidKeys());
  const keys = await deps.getKeys();
  if (!keys) throw new Error("Clés VAPID introuvables");
  return keys;
}

/** Lien ouvert au clic sur l'alerte (relatif au site, résolu par le service worker). */
export function linkFor(n: PendingNotification): string {
  if (!n.merchant_id) return "./";
  const tab = n.kind === "story" ? "story" : n.kind === "review" || n.kind === "reply" ? "reviews" : null;
  return "./?r=" + encodeURIComponent(n.merchant_id) + (tab ? "&t=" + tab : "");
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method", message: "Méthode non autorisée." });

  let body: { action?: unknown; merchant_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request", message: "Requête invalide." });
  }

  try {
    if (body.action === "key") {
      const keys = await ensureKeys(deps);
      return json(200, { publicKey: keys.publicKey });
    }
    if (body.action !== "send") return json(400, { error: "bad_request", message: "Action inconnue." });
    const merchantId = body.merchant_id == null ? null : String(body.merchant_id);
    if (merchantId !== null && !UUID.test(merchantId)) return json(400, { error: "bad_request", message: "Restaurant invalide." });

    const pending = await deps.claimPending(merchantId);
    if (!pending.length) return json(200, { sent: 0, failed: 0, removed: 0 });
    const subs = await deps.subscriptionsFor([...new Set(pending.map((n) => n.user_id))]);
    if (!subs.length) return json(200, { sent: 0, failed: 0, removed: 0 });
    const keys = await ensureKeys(deps);

    let sent = 0, failed = 0, removed = 0;
    const gone = new Set<string>();
    const jobs: Promise<void>[] = [];
    for (const n of pending) {
      const payload = new TextEncoder().encode(JSON.stringify({ title: n.title, body: n.body ?? "", tag: n.id, url: linkFor(n) }));
      for (const s of subs.filter((x) => x.user_id === n.user_id)) {
        if (!deps.allowEndpoint(s.endpoint)) { failed++; continue; }
        jobs.push((async () => {
          try {
            const res = await deps.post(s.endpoint, {
              method: "POST",
              headers: {
                Authorization: await vapidAuthorization(s.endpoint, keys, deps.subject),
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                TTL: "86400",
                Urgency: "normal",
              },
              body: await encryptPayload(payload, s.p256dh, s.auth),
            });
            if (res.status === 404 || res.status === 410) {
              // appareil désabonné : on l'oublie
              if (!gone.has(s.id)) { gone.add(s.id); removed++; await deps.removeSubscription(s.id); }
            } else if (res.status >= 200 && res.status < 300) {
              sent++;
              await deps.touchSubscription(s.id);
            } else failed++;
          } catch (e) {
            failed++;
            console.error("send-push: envoi impossible", e instanceof Error ? e.message : e);
          }
        })());
      }
    }
    await Promise.all(jobs);
    return json(200, { sent, failed, removed });
  } catch (e) {
    console.error("send-push: erreur", e instanceof Error ? e.message : e);
    return json(500, { error: "server", message: "Envoi impossible pour le moment." });
  }
}

export { b64u };
