/**
 * Sites autorisés à appeler les fonctions serveur depuis un navigateur (CORS) : les mêmes pour toutes les fonctions.
 * Seules les adresses de production de FlashMiam sont acceptées en ligne ; les adresses locales (http://localhost:…)
 * ne le sont que dans la copie de test (variable CORS_ALLOW_LOCALHOST=1, jamais définie en ligne).
 * Rappel : le CORS protège des pages web tierces ; l'authentification et les règles de la base protègent le reste.
 */
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?roche-street-food\.pages\.dev$/,               // Cloudflare Pages (et ses aperçus)
  /^https:\/\/(roche-street-food|pwa-nantes|pwa-nantes-web)\.vercel\.app$/, // Vercel : adresses de production uniquement
  /^https:\/\/evanbisa\.github\.io$/,                                        // GitHub Pages
];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

function localAllowed(): boolean {
  try {
    return Deno.env.get("CORS_ALLOW_LOCALHOST") === "1";
  } catch {
    return false; // lecture de l'environnement refusée : on reste strict
  }
}

/** L'adresse d'origine est-elle un site FlashMiam ? */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((re) => re.test(origin)) || (localAllowed() && LOCAL.test(origin));
}

/** En-têtes CORS d'une réponse : l'origine n'est renvoyée que si elle est autorisée. */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
