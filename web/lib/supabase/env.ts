/**
 * Variables de connexion à Supabase (Project Settings › API Keys).
 * - URL et clé « publishable » : publiques par nature (envoyées au navigateur), protégées par la RLS.
 * - La clé secrète n'est lue que côté serveur, dans `admin.ts`.
 */
export function supabasePublicEnv() {
  // Références littérales : Next.js remplace ces variables au moment du build
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase n'est pas configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (voir .env.example).",
    );
  }
  return { url, key };
}

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
