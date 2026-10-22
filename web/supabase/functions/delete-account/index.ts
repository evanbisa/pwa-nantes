/**
 * Edge Function « delete-account » (Supabase) : supprime le compte de l'utilisateur connecté.
 * Appel depuis le site : supabase.functions.invoke("delete-account")
 * La clé secrète est fournie par Supabase (SUPABASE_SECRET_KEYS) : elle n'est écrite nulle part.
 * verify_jwt = false : l'utilisateur est authentifié ici, par Supabase Auth.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
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

const deps: Deps = {
  async getUserId(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },
  async getMerchantId(userId) {
    const { data, error } = await admin.from("merchants").select("id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  },
  async removeFolder(bucket, folder) {
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
      if (error) throw error;
      if (!data || !data.length) return;
      const { error: rmError } = await admin.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`));
      if (rmError) throw rmError;
      if (data.length < 100) return;
    }
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
};

Deno.serve((req) => handle(req, deps));
