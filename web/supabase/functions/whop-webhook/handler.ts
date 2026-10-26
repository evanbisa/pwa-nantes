/**
 * Notifications de Whop (« webhooks ») : paiement confirmé, renouvellement, paiement refusé, résiliation, fin d'abonnement.
 * Adresse à déclarer dans Whop : https://<projet>.supabase.co/functions/v1/whop-webhook
 *
 * Chaque notification est d'abord authentifiée (signature HMAC avec le secret WHOP_WEBHOOK_SECRET, horodatage
 * à 5 minutes près), puis l'abonnement concerné est relu directement auprès de Whop : c'est cet état à jour, et non
 * le contenu de la notification, qui est enregistré (des notifications arrivées dans le désordre ne peuvent donc
 * pas remettre un ancien état). Une notification déjà traitée est ignorée.
 * Réponses : 200 traitée ou ignorée ; 401 signature invalide ; 5xx erreur passagère (Whop renvoie la notification).
 */
import { subscriptionPatch, verifyWebhook, WhopError, type SubscriptionPatch, type WhopMembership } from "../_shared/whop.ts";

export interface StoredSubscription { merchant_id: string; mode: string; status: string; whop_membership_id: string | null }
export interface Deps {
  secret: string;
  /** Identifiant du compte Whop attendu (« biz_… »), null si pas encore renseigné. */
  accountId(): Promise<string | null>;
  seen(eventId: string): Promise<boolean>;
  remember(eventId: string, type: string): Promise<void>;
  getMembership(id: string): Promise<WhopMembership>;
  /** Formule correspondant au tarif Whop (null : tarif inconnu de FlashMiam). */
  planFor(whopPlanId: string): Promise<{ tier: string; period: string } | null>;
  merchantExists(merchantId: string): Promise<boolean>;
  subscriptionOf(merchantId: string): Promise<StoredSubscription | null>;
  subscriptionByMembership(membershipId: string): Promise<StoredSubscription | null>;
  save(merchantId: string, row: SubscriptionPatch & { plan: string; period: string }): Promise<void>;
  now(): Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEMBERSHIP = /^mem_[A-Za-z0-9]{4,60}$/;
const MAX_BODY = 256 * 1024;

/** Abonnement concerné par la notification : l'objet lui-même (membership.*) ou celui d'un paiement / d'une facture. */
function membershipIdOf(type: string, data: Record<string, unknown>): string | null {
  const id = type.startsWith("membership.") ? data.id : data.membership_id ?? (data.membership as { id?: unknown } | null)?.id;
  return typeof id === "string" && MEMBERSHIP.test(id) ? id : null;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  if (req.method !== "POST") return reply(405, { error: "method" });
  if (!deps.secret) {
    console.error("whop-webhook : secret WHOP_WEBHOOK_SECRET absent");
    return reply(503, { error: "unconfigured" });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply(413, { error: "too_large" });
  if (!(await verifyWebhook(deps.secret, req.headers, raw, deps.now()))) return reply(401, { error: "signature" });

  let event: { type?: unknown; account_id?: unknown; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(400, { error: "invalid" });
  }
  const eventId = req.headers.get("webhook-id")!.slice(0, 120);
  const type = typeof event.type === "string" ? event.type.slice(0, 80) : "";
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};

  try {
    if (await deps.seen(eventId)) return reply(200, { duplicate: true });
    const expected = await deps.accountId();
    if (expected && typeof event.account_id === "string" && event.account_id !== expected) {
      console.warn("whop-webhook : notification d'un autre compte Whop ignorée");
      return reply(200, { ignored: "account" });
    }
    const membershipId = membershipIdOf(type, data);
    if (!membershipId) {
      await deps.remember(eventId, type || "inconnu");
      return reply(200, { ignored: "type" });
    }

    const result = await sync(membershipId, deps);
    await deps.remember(eventId, type);
    return reply(200, result);
  } catch (e) {
    console.error("whop-webhook :", e instanceof Error ? e.message : e);
    // Abonnement introuvable chez Whop : rien à faire (inutile de renvoyer la notification)
    if (e instanceof WhopError && e.status === 404) return reply(200, { ignored: "membership" });
    return reply(e instanceof WhopError ? 502 : 500, { error: "retry" });
  }
}

/** Relit l'abonnement chez Whop et met à jour la fiche du restaurateur correspondant. */
async function sync(membershipId: string, deps: Deps): Promise<Record<string, unknown>> {
  const m = await deps.getMembership(membershipId);
  const patch = subscriptionPatch(m);
  if (!patch || m.id !== membershipId) return { ignored: "status" };
  const plan = await deps.planFor(m.plan_id);
  if (!plan) {
    console.warn("whop-webhook : tarif Whop inconnu", m.plan_id);
    return { ignored: "plan" };
  }

  // Restaurateur : celui déjà relié à cet abonnement, sinon celui indiqué au moment du paiement (métadonnées)
  const linked = await deps.subscriptionByMembership(membershipId);
  const fromMeta = m.metadata && typeof m.metadata.merchant_id === "string" && UUID.test(m.metadata.merchant_id) ? m.metadata.merchant_id : null;
  const merchantId = linked?.merchant_id ?? fromMeta;
  if (!merchantId || !(await deps.merchantExists(merchantId))) {
    console.warn("whop-webhook : abonnement sans restaurateur FlashMiam", membershipId);
    return { ignored: "merchant" };
  }

  // Un autre abonnement Whop en cours pour ce restaurateur : la fin d'un ancien abonnement ne coupe pas le nouveau
  const current = linked ?? await deps.subscriptionOf(merchantId);
  if (current && current.mode === "whop" && current.whop_membership_id && current.whop_membership_id !== membershipId
      && current.status !== "canceled") {
    if (patch.status === "canceled") return { ignored: "superseded" };
    console.warn("whop-webhook : deux abonnements Whop actifs pour un même restaurateur", merchantId);
  }

  await deps.save(merchantId, { ...patch, plan: plan.tier, period: plan.period });
  return { updated: true, status: patch.status };
}
