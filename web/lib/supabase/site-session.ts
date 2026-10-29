import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabasePublicEnv } from "./env";

/**
 * Client Supabase qui partage la session de la carte (site principal, index.html, même domaine) : même clé de
 * stockage, même règle « Rester connecté » (session gardée sur l'appareil, sinon le temps de l'onglet).
 * Une session ouverte ici est donc retrouvée par la carte, et inversement.
 */
const STORAGE_KEY = "flashmiam-auth";
const REMEMBER_KEY = "roche-street-food:remember";

export function setRemember(on: boolean) {
  try {
    if (on) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.removeItem(REMEMBER_KEY);
  } catch { /* stockage indisponible */ }
}

const remember = () => {
  try { return localStorage.getItem(REMEMBER_KEY) === "1"; } catch { return false; }
};

const storage = {
  getItem(k: string) {
    try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; }
  },
  setItem(k: string, v: string) {
    try {
      if (remember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
      else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
    } catch { /* stockage indisponible */ }
  },
  removeItem(k: string) {
    try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

let client: SupabaseClient<Database> | null = null;
export function siteClient() {
  if (!client) {
    const { url, key } = supabasePublicEnv();
    client = createSupabaseClient<Database>(url, key, {
      auth: { storage, storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "implicit" },
    });
  }
  return client;
}
