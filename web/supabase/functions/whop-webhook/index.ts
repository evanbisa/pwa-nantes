/**
 * Edge Function « whop-webhook » (Supabase) : reçoit les notifications de Whop et tient l'abonnement à jour.
 * Secrets (tableau de bord Supabase › Edge Functions › Secrets, jamais dans le code) :
 *   WHOP_WEBHOOK_SECRET (« ws_… », affiché par Whop à la création du webhook) et WHOP_API_KEY.
 * WHOP_API_URL (facultatif) : autre adresse de l'API (bac à sable Whop, copie locale de test).
 * verify_jwt = false : Whop n'a pas de compte Supabase ; chaque notification est authentifiée par sa signature.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { whopRequest, type WhopMembership } from "../_shared/whop.ts";
import { handle, type Deps } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default as string;
  } catch { /* ancien format */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const WHOP_API = Deno.env.get("WHOP_API_URL") ?? "https://api.whop.com/api/v1";
const WHOP_KEY = Deno.env.get("WHOP_API_KEY") ?? "";
const SUB_COLUMNS = "merchant_id, mode, status, whop_membership_id";

const deps: Deps = {
  secret: Deno.env.get("WHOP_WEBHOOK_SECRET") ?? "",
  async accountId() {
    const { data, error } = await admin.from("billing_settings").select("whop_account_id").maybeSingle();
    if (error) throw error;
    return data?.whop_account_id ?? null;
  },
  async seen(eventId) {
    const { data, error } = await admin.from("whop_events").select("id").eq("id", eventId).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  async remember(eventId, type) {
    const { error } = await admin.from("whop_events").upsert({ id: eventId, type }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  },
  getMembership: (id) => whopRequest<WhopMembership>(WHOP_API, WHOP_KEY, "GET", `memberships/${encodeURIComponent(id)}`),
  async planFor(whopPlanId) {
    const { data, error } = await admin.from("billing_plans").select("tier, period").eq("whop_plan_id", whopPlanId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async merchantExists(merchantId) {
    const { data, error } = await admin.from("merchants").select("id").eq("id", merchantId).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  async subscriptionOf(merchantId) {
    const { data, error } = await admin.from("merchant_subscriptions").select(SUB_COLUMNS).eq("merchant_id", merchantId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async subscriptionByMembership(membershipId) {
    const { data, error } = await admin.from("merchant_subscriptions").select(SUB_COLUMNS).eq("whop_membership_id", membershipId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async save(merchantId, row) {
    const { error } = await admin.from("merchant_subscriptions")
      .upsert({ merchant_id: merchantId, ...row, updated_at: new Date().toISOString() }, { onConflict: "merchant_id" });
    if (error) throw error;
  },
  now: () => new Date(),
};

Deno.serve((req) => handle(req, deps));
