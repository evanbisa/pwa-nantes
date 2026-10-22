/**
 * Suppression définitive du compte de l'utilisateur connecté (droit à l'effacement, RGPD) :
 * fichiers de sa fiche (photos, stories, justificatifs), puis son compte Supabase Auth.
 * La suppression du compte efface en cascade le profil, la fiche, le SIRET, l'abonnement,
 * les abonnements, statistiques, stories et promotions.
 */
export interface Deps {
  getUserId(token: string): Promise<string | null>;
  getMerchantId(userId: string): Promise<string | null>;
  /** Supprime tous les fichiers d'un dossier d'un espace de stockage. */
  removeFolder(bucket: string, folder: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

/** Sites autorisés à appeler la fonction depuis un navigateur (même liste que verify-siret) */
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?roche-street-food\.pages\.dev$/,
  /^https:\/\/(roche-street-food|pwa-nantes|pwa-nantes-web)\.vercel\.app$/,
  /^https:\/\/evanbisa\.github\.io$/,
  /^http:\/\/localhost:\d+$/,
];
export const BUCKETS = ["photos", "stories", "documents"];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method", message: "Méthode non autorisée." });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = token ? await deps.getUserId(token) : null;
  if (!userId) return json(401, { error: "unauthenticated", message: "Connectez-vous pour supprimer votre compte." });

  try {
    const merchantId = await deps.getMerchantId(userId);
    if (merchantId) for (const bucket of BUCKETS) await deps.removeFolder(bucket, merchantId);
    await deps.deleteUser(userId);
    return json(200, { deleted: true });
  } catch (e) {
    console.error("delete-account: suppression impossible", e);
    return json(500, { error: "server", message: "Suppression impossible pour le moment. Réessayez plus tard." });
  }
}
