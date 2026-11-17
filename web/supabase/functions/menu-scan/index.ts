/**
 * Edge Function « menu-scan » (Supabase) : lit les photos de la carte d'un restaurateur et renvoie ses plats.
 * Appel depuis le site : supabase.functions.invoke("menu-scan", { body: { images: [{ mediaType, data }] } })
 * Secrets : ANTHROPIC_API_KEY (à ajouter dans Supabase › Edge Functions › Secrets) ; la clé secrète Supabase est
 * fournie par Supabase (SUPABASE_SECRET_KEYS). verify_jwt = false : l'utilisateur est authentifié ici.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, type Deps } from "./handler.ts";
import { makeExtractor } from "./extract.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default as string;
  } catch { /* ancien format */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const configured = !!Deno.env.get("ANTHROPIC_API_KEY");

const deps: Deps = {
  configured,
  async getUserId(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },
  async getMerchantId(userId) {
    const { data, error } = await admin.from("merchants").select("id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  },
  async countScansSince(merchantId, sinceIso) {
    const { count, error } = await admin.from("menu_scans").select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId).gte("created_at", sinceIso);
    if (error) throw error;
    return count ?? 0;
  },
  async recordScan(merchantId, images) {
    const { data, error } = await admin.from("menu_scans").insert({ merchant_id: merchantId, images }).select("id").single();
    if (error) throw error;
    return data.id as number;
  },
  async finishScan(scanId, items) {
    const { error } = await admin.from("menu_scans").update({ items }).eq("id", scanId);
    if (error) throw error;
  },
  extract: configured ? makeExtractor() : () => Promise.reject(new Error("ANTHROPIC_API_KEY absent")),
};

Deno.serve((req) => handle(req, deps));
