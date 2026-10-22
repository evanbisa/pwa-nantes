/**
 * Vérification du SIRET d'un restaurateur connecté, puis enregistrement côté serveur :
 * création de sa fiche (brouillon) et de ses données privées (SIRET vérifié).
 * Les dépendances (base, Sirene) sont injectées pour pouvoir tester sans réseau.
 */
import { type Company, checkSireneResponse, isValidSiret, merchantName, onlyDigits } from "./siret.ts";

export interface Deps {
  /** Identifiant de l'utilisateur dont le jeton de session est valide, sinon null. */
  getUserId(token: string): Promise<string | null>;
  getRole(userId: string): Promise<string | null>;
  /** Fiche déjà associée à ce SIRET, le cas échéant. */
  findSiretOwner(siret: string): Promise<{ merchantId: string; userId: string } | null>;
  getMyMerchant(userId: string): Promise<{ id: string; status: string; siret: string | null } | null>;
  fetchSirene(siret: string): Promise<{ ok: boolean; status: number; body: unknown }>;
  createMerchant(row: { user_id: string; name: string; address: string | null; lat: number | null; lng: number | null; is_test?: boolean }): Promise<string>;
  /** Enregistre (ou remplace) la vérification. Doit lever une erreur { code: "23505" } si le SIRET est déjà pris. */
  saveVerification(merchantId: string, company: Company, snapshot: unknown): Promise<void>;
  /** SIRET de test accepté (phase de test) ? Désactivable : variable ALLOW_TEST_SIRET=false. */
  allowTestSiret?: boolean;
}

/** SIRET fictif pour essayer l'espace restaurateur (fiche marquée « de test »). */
export const TEST_SIRET = "99999999900009";
const TEST_SIREN = "999999999";
/** SIRET de test propre à chaque fiche (le SIRET est unique en base) : 999 999 999 + NIC aléatoire, clé de Luhn valide. */
function uniqueTestSiret(): string {
  const base = TEST_SIREN + String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
  for (let k = 0; k < 10; k++) if (isValidSiret(base + k)) return base + k;
  return TEST_SIRET;
}
const TEST_COMPANY: Omit<Company, "siret"> = {
  legalName: "ÉTABLISSEMENT DE TEST (fictif)", tradeName: "Restaurant de test", naf: "56.10C", nafLabel: "Restauration de type rapide",
  address: "1 Place Napoléon 85000 La Roche-sur-Yon", lat: 46.6705, lng: -1.427,
};

/** Sites autorisés à appeler la fonction depuis un navigateur */
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?roche-street-food\.pages\.dev$/,   // Cloudflare Pages (et ses aperçus)
  /^https:\/\/(roche-street-food|pwa-nantes|pwa-nantes-web)\.vercel\.app$/,  // Vercel : adresses de production uniquement
  /^https:\/\/evanbisa\.github\.io$/,
  /^http:\/\/localhost:\d+$/,
];

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
  const error = (status: number, code: string, message: string) => json(status, { error: code, message });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return error(405, "method", "Méthode non autorisée.");

  // 1. Restaurateur connecté (jeton de session Supabase Auth)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = token ? await deps.getUserId(token) : null;
  if (!userId) return error(401, "unauthenticated", "Connectez-vous pour vérifier votre SIRET.");
  if ((await deps.getRole(userId)) !== "merchant") {
    return error(403, "not_merchant", "Seul un compte restaurateur peut faire vérifier un SIRET.");
  }

  // 2. SIRET bien formé
  let payload: { siret?: unknown };
  try {
    payload = await req.json();
  } catch {
    return error(400, "bad_request", "Requête invalide.");
  }
  const siret = onlyDigits(payload?.siret);
  if (siret.length !== 14) return error(400, "invalid_siret", "Le SIRET comporte 14 chiffres.");
  if (!isValidSiret(siret)) return error(400, "invalid_siret", "Ce numéro de SIRET n'est pas valide (clé de contrôle).");

  // SIRET de test : établissement fictif, sans appel au répertoire Sirene
  if (siret === TEST_SIRET) {
    if (deps.allowTestSiret === false) return error(403, "test_disabled", "Le SIRET de test n'est plus accepté.");
    const mine = await deps.getMyMerchant(userId);
    if (mine && mine.siret && !mine.siret.startsWith(TEST_SIREN) && mine.status !== "draft") {
      return error(409, "siret_locked", "Votre fiche est en ligne : le SIRET ne peut plus être changé. Contactez-nous.");
    }
    const stored = mine?.siret?.startsWith(TEST_SIREN) ? mine.siret : uniqueTestSiret();
    const company: Company = { siret: stored, ...TEST_COMPANY };
    try {
      const merchantId = mine?.id ?? (await deps.createMerchant({
        user_id: userId, name: TEST_COMPANY.tradeName!, address: TEST_COMPANY.address, lat: TEST_COMPANY.lat, lng: TEST_COMPANY.lng, is_test: true,
      }));
      await deps.saveVerification(merchantId, company, { test: true });
      return json(200, { verified: true, test: true, merchant_id: merchantId, company: { ...company, siret: TEST_SIRET } });
    } catch (e) {
      console.error("verify-siret: enregistrement impossible (test)", e);
      return error(500, "server", "Enregistrement impossible pour le moment. Réessayez plus tard.");
    }
  }

  // 3. Pas déjà utilisé par un autre restaurateur ; pas de changement de SIRET sur une fiche en ligne
  const owner = await deps.findSiretOwner(siret);
  if (owner && owner.userId !== userId) {
    return error(409, "siret_taken", "Ce SIRET est déjà associé à un autre compte restaurateur.");
  }
  const mine = await deps.getMyMerchant(userId);
  if (mine && mine.siret && mine.siret !== siret && mine.status !== "draft") {
    return error(409, "siret_locked", "Votre fiche est en ligne : le SIRET ne peut plus être changé. Contactez-nous.");
  }

  // 4. Répertoire Sirene (source officielle de l'INSEE)
  let sirene: { ok: boolean; status: number; body: unknown };
  try {
    sirene = await deps.fetchSirene(siret);
  } catch {
    return error(502, "sirene_unavailable", "Le répertoire Sirene ne répond pas. Réessayez dans un instant.");
  }
  if (!sirene.ok) {
    return error(502, "sirene_unavailable", sirene.status === 429
      ? "Le répertoire Sirene est très sollicité. Réessayez dans une minute."
      : "Le répertoire Sirene ne répond pas. Réessayez dans un instant.");
  }
  const check = checkSireneResponse(siret, sirene.body);
  if (!check.ok) return error(check.status, check.code, check.message);
  const { company, snapshot } = check;

  // 5. Enregistrement (clé secrète, côté serveur uniquement)
  try {
    const merchantId = mine?.id ?? (await deps.createMerchant({
      user_id: userId,
      name: merchantName(company),
      address: company.address,
      lat: company.lat,
      lng: company.lng,
    }));
    await deps.saveVerification(merchantId, company, snapshot);
    return json(200, { verified: true, merchant_id: merchantId, company });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      return error(409, "siret_taken", "Ce SIRET est déjà associé à un autre compte restaurateur.");
    }
    console.error("verify-siret: enregistrement impossible", e);
    return error(500, "server", "Enregistrement impossible pour le moment. Réessayez plus tard.");
  }
}
