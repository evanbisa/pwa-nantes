/**
 * Edge Function « send-push » (Supabase) : alertes push des notifications FlashMiam.
 * Appels depuis le site : supabase.functions.invoke("send-push", { body: { action: "key" } })  → clé publique VAPID
 *                         supabase.functions.invoke("send-push", { body: { action: "send", merchant_id } })
 * La clé secrète Supabase est fournie par Supabase (SUPABASE_SECRET_KEYS) : elle n'est écrite nulle part.
 * Les clés VAPID sont créées par la fonction et conservées dans la table push_config (serveur uniquement).
 * verify_jwt = false : aucun secret n'est nécessaire (voir handler.ts).
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DEFAULT_ENDPOINTS, type Deps, handle } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default as string;
  } catch { /* ancien format */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
// Tests locaux uniquement : faux service d'alertes (jamais défini en production)
const allow = Deno.env.get("PUSH_ENDPOINT_ALLOW") ? new RegExp(Deno.env.get("PUSH_ENDPOINT_ALLOW")!) : DEFAULT_ENDPOINTS;

const deps: Deps = {
  async getKeys() {
    const { data, error } = await admin.from("push_config").select("public_key, private_jwk").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data ? { publicKey: data.public_key, privateJwk: data.private_jwk } : null;
  },
  async saveKeys(keys) {
    const { error } = await admin.from("push_config").insert({ id: 1, public_key: keys.publicKey, private_jwk: keys.privateJwk });
    if (error && error.code !== "23505") throw error;
  },
  async claimPending(merchantId) {
    const { data, error } = await admin.rpc("claim_pending_pushes", { p_merchant_id: merchantId });
    if (error) throw error;
    return data ?? [];
  },
  async subscriptionsFor(userIds) {
    const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
    if (error) throw error;
    return data ?? [];
  },
  async removeSubscription(id) {
    await admin.from("push_subscriptions").delete().eq("id", id);
  },
  async touchSubscription(id) {
    await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", id);
  },
  post: (endpoint, init) => fetch(endpoint, { ...init, signal: AbortSignal.timeout(10000) }),
  allowEndpoint: (endpoint) => allow.test(endpoint),
  subject: "mailto:flashmiampro@gmail.com",
};

Deno.serve((req) => handle(req, deps));
