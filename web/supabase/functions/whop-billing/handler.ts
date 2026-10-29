/**
 * Abonnement du restaurateur connecté, payé sur Whop :
 *   POST { action: "checkout", plan: "essentiel" | "premium", period: "month" | "year", return_url }
 *        → 200 { url }  page de paiement Whop (le retour se fait sur return_url, une adresse du site)
 *   POST { action: "cancel" }  → 200 { subscription }  résiliation à la fin de la période déjà payée (jamais immédiate)
 *   POST { action: "resume" }  → 200 { subscription }  annule une résiliation programmée
 * L'abonnement est enregistré par la fonction whop-webhook, à la confirmation du paiement par Whop.
 * Refus : { error, message } (400 demande, 401 non connecté, 403 inscription incomplète, 404 aucun abonnement,
 * 409 déjà abonné ou paiement pas encore ouvert, 502 Whop indisponible, 503 configuration incomplète).
 */
import { subscriptionPatch, WhopError, type SubscriptionPatch, type WhopMembership } from "../_shared/whop.ts";

export interface Merchant { id: string; verified: boolean; honor: boolean }
export interface Subscription {
  mode: string;
  status: string;
  whop_membership_id: string | null;
  cancel_at_period_end: boolean;
}
export interface Deps {
  getUserId(token: string): Promise<string | null>;
  getMerchant(userId: string): Promise<Merchant | null>;
  settings(): Promise<{ live: boolean; accountId: string | null }>;
  /** Identifiant du tarif Whop de la formule (null : pas encore renseigné). */
  whopPlanId(tier: string, period: string): Promise<string | null>;
  getSubscription(merchantId: string): Promise<Subscription | null>;
  saveSubscription(merchantId: string, patch: SubscriptionPatch): Promise<void>;
  /** Appel à l'API Whop (lève WhopError en cas d'échec). */
  whop<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T>;
}

/** Sites autorisés à appeler la fonction depuis un navigateur (même liste que les autres fonctions) */
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?roche-street-food\.pages\.dev$/,
  /^https:\/\/(roche-street-food|pwa-nantes|pwa-nantes-web)\.vercel\.app$/,
  /^https:\/\/evanbisa\.github\.io$/,
  /^http:\/\/localhost:\d+$/,
];
const TIERS = ["essentiel", "premium"];
const PERIODS = ["month", "year"];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Adresse de retour après paiement : une page du site uniquement (jamais un autre site). */
function returnUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  try {
    const u = new URL(raw);
    return ALLOWED_ORIGINS.some((re) => re.test(u.origin)) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  const refuse = (status: number, error: string, message: string) => json(status, { error, message });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return refuse(405, "method", "Méthode non autorisée.");

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 2048) return refuse(400, "invalid", "Demande trop longue.");
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("objet attendu");
  } catch {
    return refuse(400, "invalid", "Demande illisible.");
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = token ? await deps.getUserId(token) : null;
  if (!userId) return refuse(401, "unauthenticated", "Connectez-vous à votre compte restaurateur.");

  try {
    const merchant = await deps.getMerchant(userId);
    if (!merchant) return refuse(403, "not_merchant", "Réservé aux restaurateurs inscrits.");
    const sub = await deps.getSubscription(merchant.id);
    const whopSub = sub && sub.mode === "whop" && sub.whop_membership_id && sub.status !== "canceled" ? sub : null;

    if (body.action === "checkout") {
      const { plan, period } = body;
      if (typeof plan !== "string" || !TIERS.includes(plan) || typeof period !== "string" || !PERIODS.includes(period)) {
        return refuse(400, "invalid", "Formule inconnue.");
      }
      const back = returnUrl(body.return_url);
      if (!back) return refuse(400, "invalid", "Adresse de retour refusée.");
      if (!merchant.verified || !merchant.honor) return refuse(403, "incomplete", "Terminez d'abord la vérification de votre établissement.");
      if (whopSub) return refuse(409, "already", "Vous avez déjà un abonnement en cours.");
      const settings = await deps.settings();
      if (!settings.live) return refuse(409, "demo", "Le paiement en ligne n'est pas encore ouvert.");
      const planId = await deps.whopPlanId(plan, period);
      if (!planId || !settings.accountId) return refuse(503, "unconfigured", "Cette formule n'est pas encore disponible. Réessayez plus tard.");
      const checkout = await deps.whop<{ purchase_url?: string }>("POST", "checkout_configurations", {
        account_id: settings.accountId,
        plan_id: planId,
        metadata: { merchant_id: merchant.id, plan, period },
        redirect_url: back,
      });
      const url = checkout.purchase_url;
      // Page de paiement Whop (adresse locale admise pour la copie de test)
      if (typeof url !== "string" || !/^(https:\/\/|http:\/\/localhost:\d+\/)[^\s"<>]+$/.test(url)) throw new WhopError(502, "Whop : lien de paiement absent");
      return json(200, { url });
    }

    if (body.action === "cancel" || body.action === "resume") {
      if (!whopSub) return refuse(404, "none", "Aucun abonnement en cours à modifier.");
      const cancel = body.action === "cancel";
      // PATCH avec cancel_at_period_end : vrai = fin à l'échéance (accès conservé jusque-là), faux = résiliation annulée.
      // (L'action « cancel » de Whop sans ce paramètre couperait l'accès immédiatement : jamais utilisée ici.)
      const m = await deps.whop<WhopMembership>("PATCH", `memberships/${encodeURIComponent(whopSub.whop_membership_id!)}`, { cancel_at_period_end: cancel });
      const patch = subscriptionPatch(m);
      if (!patch || patch.whop_membership_id !== whopSub.whop_membership_id) throw new WhopError(502, "Whop : réponse inattendue");
      await deps.saveSubscription(merchant.id, patch);
      return json(200, { subscription: { status: patch.status, cancel_at_period_end: patch.cancel_at_period_end, current_period_end: patch.current_period_end } });
    }

    return refuse(400, "invalid", "Action inconnue.");
  } catch (e) {
    console.error("whop-billing :", e instanceof Error ? e.message : e);
    if (e instanceof WhopError) return refuse(502, "whop", "Le service de paiement ne répond pas. Réessayez dans un instant.");
    return refuse(500, "server", "Opération impossible pour le moment. Réessayez plus tard.");
  }
}
