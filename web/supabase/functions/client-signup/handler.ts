/**
 * Inscription d'un client sans code par e-mail (les restaurateurs, eux, confirment leur adresse par un code).
 * L'adresse est contrôlée autrement : format, domaine capable de recevoir des e-mails (enregistrements DNS),
 * et la personne l'a relue et confirmée sur le site. Le compte est créé déjà confirmé, toujours comme client.
 * Appels limités par adresse IP (empreinte seulement) et au total, contre les créations de comptes en masse.
 *
 *   POST { action: "check", email }                                          → 200 { ok: true }
 *   POST { action: "signup", email, password, first_name, gender?, birth_year? } → 200 { created: true }
 * Refus : { error, message } (400 données, 409 compte existant, 422 adresse ou mot de passe, 429 trop d'essais).
 */
export interface Deps {
  /** Le domaine peut-il recevoir des e-mails ? "unknown" : impossible de le savoir (l'inscription continue). */
  mailDomain(domain: string): Promise<"ok" | "none" | "unknown">;
  /** Enregistre une tentative ; faux si le plafond de l'heure écoulée est atteint. */
  attempt(ipHash: string, kind: "check" | "signup"): Promise<boolean>;
  /** Empreinte de l'adresse IP (l'adresse elle-même n'est jamais enregistrée). */
  hashIp(ip: string): Promise<string>;
  createUser(u: { email: string; password: string; metadata: Record<string, string> }): Promise<"created" | "exists" | "weak">;
  now(): Date;
}

/** Sites autorisés à appeler la fonction depuis un navigateur (même liste que les autres fonctions) */
const ALLOWED_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?roche-street-food\.pages\.dev$/,
  /^https:\/\/(roche-street-food|pwa-nantes|pwa-nantes-web)\.vercel\.app$/,
  /^https:\/\/evanbisa\.github\.io$/,
  /^http:\/\/localhost:\d+$/,
];
/** Messageries connues : inutile d'interroger le DNS. */
const KNOWN_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.fr", "live.com", "msn.com",
  "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr",
  "laposte.net", "gmx.fr", "proton.me", "protonmail.com",
]);
// Adresse courante : partie locale sans espace ni caractère spécial réservé, domaine en lettres, chiffres et tirets
const EMAIL_RE = /^[^\s@"(),:;<>[\]\\]{1,64}@(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const PASSWORD_RULES: ((p: string) => boolean)[] = [
  (p) => p.length >= 8 && p.length <= 72,
  (p) => /\p{Lu}/u.test(p),
  (p) => /\p{Ll}/u.test(p),
  (p) => /\d/.test(p),
  (p) => /[^\p{L}\p{N}\s]/u.test(p),
];
export const MIN_AGE = 15;
const GENDERS = ["female", "male", "other"];

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
/**
 * Adresse IP du visiteur. Celle posée par la passerelle (Cloudflare : cf-connecting-ip, réécrite à chaque requête)
 * passe en premier : le début de X-Forwarded-For peut être inventé par le client pour contourner le plafond.
 */
const clientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  const refuse = (status: number, error: string, message: string) => json(status, { error, message });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return refuse(405, "method", "Méthode non autorisée.");

  if (Number(req.headers.get("content-length") ?? 0) > 4096) return refuse(413, "invalid", "Demande trop longue.");
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4096) return refuse(400, "invalid", "Demande trop longue.");
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("objet attendu");
  } catch {
    return refuse(400, "invalid", "Demande illisible.");
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const action = str(body.action);
  if (action !== "check" && action !== "signup") return refuse(400, "invalid", "Action inconnue.");

  const email = str(body.email).trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return refuse(422, "email_invalid", "Adresse e-mail invalide.");
  const domain = email.slice(email.indexOf("@") + 1);

  let fields: { password: string; metadata: Record<string, string> } | null = null;
  if (action === "signup") {
    const password = str(body.password);
    if (!PASSWORD_RULES.every((rule) => rule(password))) {
      return refuse(422, "weak_password", "Mot de passe trop faible : 8 caractères au moins, avec majuscule, minuscule, chiffre et caractère spécial.");
    }
    const firstName = str(body.first_name).trim().replace(/\s+/g, " ");
    if (firstName.length < 2 || firstName.length > 40 || /[\p{Cc}<>]/u.test(firstName)) {
      return refuse(400, "invalid_name", "Prénom invalide (2 à 40 caractères).");
    }
    const metadata: Record<string, string> = { role: "student", first_name: firstName };
    const gender = str(body.gender);
    if (gender && !GENDERS.includes(gender)) return refuse(400, "invalid", "Valeur du sexe inconnue.");
    if (gender) metadata.gender = gender;
    const birthYear = str(body.birth_year);
    if (birthYear) {
      const year = deps.now().getUTCFullYear();
      if (!/^\d{4}$/.test(birthYear) || +birthYear > year - MIN_AGE || +birthYear < year - 100) {
        return refuse(400, "invalid_age", `FlashMiam est réservé aux personnes de ${MIN_AGE} ans et plus.`);
      }
      metadata.birth_year = birthYear;
    }
    fields = { password, metadata };
  }

  try {
    if (!(await deps.attempt(await deps.hashIp(clientIp(req)), action))) {
      return refuse(429, "rate_limited", "Trop de tentatives depuis cette connexion. Réessayez dans une heure.");
    }
    if (!KNOWN_DOMAINS.has(domain) && (await deps.mailDomain(domain)) === "none") {
      return refuse(422, "email_domain", `Le domaine « ${domain} » ne reçoit pas d'e-mails : vérifiez l'adresse.`);
    }
    if (!fields) return json(200, { ok: true });
    const result = await deps.createUser({ email, ...fields });
    if (result === "exists") return refuse(409, "exists", "Un compte existe déjà avec cet e-mail.");
    if (result === "weak") return refuse(422, "weak_password", "Mot de passe trop facile à deviner : choisissez-en un plus long ou plus varié.");
    return json(200, { created: true });
  } catch (e) {
    console.error("client-signup : échec", e instanceof Error ? e.message : e);
    return refuse(500, "server", "Inscription impossible pour le moment. Réessayez dans un instant.");
  }
}

/**
 * Réponse d'un service DNS sur HTTPS (format JSON) → le domaine reçoit-il des e-mails ?
 * Serveur de messagerie (MX) ou, à défaut, adresse du domaine (RFC 5321) : oui ; domaine inexistant, ou « MX nul »
 * (RFC 7505, « ce domaine n'accepte aucun e-mail ») : non ; réponse impossible : inconnu.
 */
export function mailVerdict(mx: { Status?: number; Answer?: { type: number; data: string }[] } | null,
  a: { Status?: number; Answer?: { type: number }[] } | null): "ok" | "none" | "unknown" {
  if (!mx || typeof mx.Status !== "number") return "unknown";
  if (mx.Status === 3) return "none";
  if (mx.Status !== 0) return "unknown";
  const records = (mx.Answer ?? []).filter((r) => r.type === 15);
  if (records.length) return records.every((r) => /^\s*0\s+\.\s*$/.test(r.data)) ? "none" : "ok";
  if (!a || a.Status !== 0) return a && a.Status === 3 ? "none" : "unknown";
  return (a.Answer ?? []).some((r) => r.type === 1 || r.type === 28) ? "ok" : "none";
}
