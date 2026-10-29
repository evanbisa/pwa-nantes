/**
 * Edge Function « whop-billing » (Supabase) : paiement, résiliation et reprise de l'abonnement du restaurateur sur Whop.
 * Appel depuis le site : supabase.functions.invoke("whop-billing", { body: { action, … } })
 * Secrets (tableau de bord Supabase › Edge Functions › Secrets, jamais dans le code) : WHOP_API_KEY.
 * WHOP_API_URL (facultatif) : autre adresse de l'API (bac à sable Whop, copie locale de test).
 * verify_jwt = false : l'utilisateur est authentifié ici, par Supabase Auth.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { whopRequest } from "../_shared/whop.ts";
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

const deps: Deps = {
  async getUserId(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },
  async getMerchant(userId) {
    const { data, error } = await admin.from("merchants").select("id, honor_at, merchant_private(siret_verified_at)").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const priv = data.merchant_private as { siret_verified_at: string | null } | { siret_verified_at: string | null }[] | null;
    const verifiedAt = Array.isArray(priv) ? priv[0]?.siret_verified_at : priv?.siret_verified_at;
    return { id: data.id, verified: !!verifiedAt, honor: !!data.honor_at };
  },
  async settings() {
    const { data, error } = await admin.from("billing_settings").select("whop_live, whop_account_id").maybeSingle();
    if (error) throw error;
    // Sans clé d'API, le paiement Whop reste fermé (mode démonstration)
    return { live: !!data?.whop_live && !!WHOP_KEY, accountId: data?.whop_account_id ?? null };
  },
  async whopPlanId(tier, period) {
    const { data, error } = await admin.from("billing_plans").select("whop_plan_id").eq("tier", tier).eq("period", period).maybeSingle();
    if (error) throw error;
    return data?.whop_plan_id ?? null;
  },
  async getSubscription(merchantId) {
    const { data, error } = await admin.from("merchant_subscriptions").select("mode, status, whop_membership_id, cancel_at_period_end").eq("merchant_id", merchantId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async saveSubscription(merchantId, patch) {
    const { error } = await admin.from("merchant_subscriptions").update({ ...patch, updated_at: new Date().toISOString() }).eq("merchant_id", merchantId);
    if (error) throw error;
  },
  whop: (method, path, body) => whopRequest(WHOP_API, WHOP_KEY, method, path, body),
};

Deno.serve((req) => handle(req, deps));
