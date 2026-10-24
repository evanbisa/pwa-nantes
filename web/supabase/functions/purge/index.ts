/**
 * Edge Function « purge » (Supabase) : ménage quotidien des données arrivées au bout de leur durée de conservation.
 * Déclenchée chaque nuit par pg_cron (voir web/supabase/manual/purge_schedule.sql).
 * La clé secrète Supabase est fournie par Supabase (SUPABASE_SECRET_KEYS) : elle n'est écrite nulle part.
 * verify_jwt = false : aucun secret n'est nécessaire (voir handler.ts).
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { type Deps, handle } from "./handler.ts";

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
  async lastRun(job) {
    const { data, error } = await admin.from("maintenance_runs").select("ran_at").eq("job", job).maybeSingle();
    if (error) throw error;
    return data ? new Date(data.ran_at) : null;
  },
  async markRun(job, at) {
    const { error } = await admin.from("maintenance_runs").upsert({ job, ran_at: at.toISOString() }, { onConflict: "job" });
    if (error) throw error;
  },
  async deleteOlder(table, column, before) {
    const { error, count } = await admin.from(table).delete({ count: "exact" }).lt(column, before);
    if (error) throw error;
    return count ?? 0;
  },
  async expiredStories(before, limit) {
    const { data, error } = await admin.from("stories").select("id, image_path").lt("expires_at", before).limit(limit);
    if (error) throw error;
    return data ?? [];
  },
  async removeFiles(bucket, paths) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw error;
  },
  async deleteStories(ids) {
    const { error } = await admin.from("stories").delete().in("id", ids);
    if (error) throw error;
  },
  now: () => new Date(),
};

Deno.serve((req) => handle(req, deps));
