import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabasePublicEnv } from "./env";

/**
 * Client « administrateur » avec la clé secrète : contourne la RLS.
 * Réservé au serveur (l'import de "server-only" fait échouer le build s'il atterrit côté navigateur).
 * Usages prévus : enregistrer le SIRET vérifié, créer la fiche d'un restaurateur, modération.
 */
export function createAdminClient() {
  const { url } = supabasePublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY manquante (variable serveur, jamais préfixée NEXT_PUBLIC_).");
  return createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
