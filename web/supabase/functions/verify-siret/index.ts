/**
 * Edge Function « verify-siret » (Supabase).
 * Appel depuis le site : supabase.functions.invoke("verify-siret", { body: { siret } })
 * La clé secrète est fournie par Supabase (SUPABASE_SECRET_KEYS) : elle n'est écrite nulle part.
 * verify_jwt = false : l'utilisateur est authentifié ici, par Supabase Auth (compatible avec les nouvelles clés).
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, type Deps } from "./handler.ts";
import { sireneUrl } from "./siret.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default as string;
  } catch { /* ancien format */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const deps: Deps = {
  async getUserId(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },
  async getRole(userId) {
    const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    return data?.role ?? null;
  },
  async findSiretOwner(siret) {
    const { data, error } = await admin.from("merchant_private").select("merchant_id, merchants!inner(user_id)").eq("siret", siret).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const m = data.merchants as unknown as { user_id: string };
    return { merchantId: data.merchant_id, userId: m.user_id };
  },
  async getMyMerchant(userId) {
    const { data, error } = await admin.from("merchants").select("id, status, merchant_private(siret)").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const priv = data.merchant_private as unknown as { siret: string } | { siret: string }[] | null;
    const siret = Array.isArray(priv) ? priv[0]?.siret ?? null : priv?.siret ?? null;
    return { id: data.id, status: data.status, siret };
  },
  async fetchSirene(siret) {
    const res = await fetch(sireneUrl(siret, Deno.env.get("SIRENE_API_URL") || undefined), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : null };
  },
  async createMerchant(row) {
    const { data, error } = await admin.from("merchants").insert({ ...row, category: "other" }).select("id").single();
    if (error) throw error;
    return data.id;
  },
  async saveVerification(merchantId, company, snapshot) {
    const { error } = await admin.from("merchant_private").upsert({
      merchant_id: merchantId,
      siret: company.siret,
      siret_verified_at: new Date().toISOString(),
      legal_name: company.legalName,
      naf_code: company.naf,
      sirene_snapshot: snapshot,
    }, { onConflict: "merchant_id" });
    if (error) throw error;
  },
};

// SIRET fictif refusé en ligne : accepté seulement si ALLOW_TEST_SIRET=true (copie locale de test)
deps.allowTestSiret = Deno.env.get("ALLOW_TEST_SIRET") === "true";

Deno.serve((req) => handle(req, deps));
