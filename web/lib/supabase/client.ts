import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { supabasePublicEnv } from "./env";

/** Client Supabase pour les composants navigateur ("use client"). Session stockée en cookies. */
export function createClient() {
  const { url, key } = supabasePublicEnv();
  return createBrowserClient<Database>(url, key);
}
