/**
 * Outils communs aux fonctions de paiement Whop (whop-billing, whop-webhook, delete-account).
 * API Whop : https://api.whop.com/api/v1, clé d'API du compte Whop dans le secret WHOP_API_KEY (jamais dans le code).
 */

/** Abonnement Whop (« membership »), champs utilisés ici. */
export interface WhopMembership {
  id: string;
  status: string;
  plan_id: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  manage_url: string | null;
  metadata: Record<string, unknown> | null;
}

/** Ligne merchant_subscriptions tenue à jour d'après Whop. */
export interface SubscriptionPatch {
  mode: "whop";
  status: "active" | "past_due" | "canceled";
  whop_membership_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  manage_url: string | null;
}

export class WhopError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Appel à l'API Whop ; une réponse en erreur (ou aucune réponse) lève WhopError. */
export async function whopRequest<T>(base: string, apiKey: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new WhopError(0, `Whop injoignable : ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new WhopError(res.status, `Whop ${method} ${path.replace(/mem_[A-Za-z0-9]+/, "mem_…")} : HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/**
 * État Whop → état de l'abonnement sur FlashMiam.
 * active, trialing, canceling (résiliation à la fin de la période) : la fiche reste en ligne ;
 * past_due, unresolved : paiement refusé, Whop réessaie (fiche maintenue, le restaurateur est prévenu) ;
 * canceled, expired, completed : terminé (la fiche repasse en brouillon). drafted : pas encore payé (ignoré).
 */
export function subscriptionStatus(whopStatus: string): SubscriptionPatch["status"] | null {
  if (["active", "trialing", "canceling"].includes(whopStatus)) return "active";
  if (["past_due", "unresolved"].includes(whopStatus)) return "past_due";
  if (["canceled", "expired", "completed"].includes(whopStatus)) return "canceled";
  return null;
}

/** Ligne à enregistrer pour un abonnement Whop (null : état sans effet, ex. commande pas encore payée). */
export function subscriptionPatch(m: WhopMembership): SubscriptionPatch | null {
  const status = subscriptionStatus(m.status);
  if (!status || !/^mem_[A-Za-z0-9]{4,60}$/.test(m.id)) return null;
  const end = m.current_period_end && !Number.isNaN(Date.parse(m.current_period_end)) ? new Date(m.current_period_end).toISOString() : null;
  const manage = typeof m.manage_url === "string" && m.manage_url.length <= 500 && /^https:\/\/[^\s"<>]+$/.test(m.manage_url) ? m.manage_url : null;
  return {
    mode: "whop", status, whop_membership_id: m.id, current_period_end: end,
    cancel_at_period_end: m.cancel_at_period_end === true || m.status === "canceling", manage_url: manage,
  };
}

const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Signature d'une notification Whop (norme « Standard Webhooks ») : en-têtes webhook-id, webhook-timestamp et
 * webhook-signature (« v1,<base64> », plusieurs possibles séparées par des espaces), HMAC-SHA256 de
 * « id.horodatage.corps » avec, pour clé, le secret Whop tel quel (octets UTF-8 de « ws_… » en entier, comme le
 * fait le SDK officiel). Horodatage accepté à 5 minutes près : une notification interceptée ne peut pas être rejouée plus tard.
 */
export async function verifyWebhook(secret: string, headers: Headers, rawBody: string, now: Date): Promise<boolean> {
  const id = headers.get("webhook-id") ?? "";
  const ts = headers.get("webhook-timestamp") ?? "";
  const sigs = (headers.get("webhook-signature") ?? "").split(" ").filter((s) => s.startsWith("v1,")).map((s) => s.slice(3));
  if (!secret || !id || !/^\d{1,12}$/.test(ts) || !sigs.length) return false;
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${rawBody}`))));
  return sigs.some((s) => sameText(s, expected));
}

/** Signe une notification comme Whop (tests et copie locale). */
export async function signWebhook(secret: string, id: string, ts: number, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "v1," + b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${rawBody}`))));
}
