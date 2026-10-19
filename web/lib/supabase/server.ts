import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { supabasePublicEnv } from "./env";

/**
 * Client Supabase pour le serveur (Server Components, Server Actions, Route Handlers),
 * avec la session de l'utilisateur : les politiques RLS s'appliquent comme dans le navigateur.
 */
export async function createClient() {
  const { url, key } = supabasePublicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component (cookies en lecture seule) : le proxy rafraîchit la session.
        }
      },
    },
  });
}
