/**
 * Règles de l'inscription client, identiques à celles du serveur (supabase/functions/client-signup/handler.ts) :
 * un mot de passe accepté ici l'est aussi par le serveur.
 */

export type PasswordRule = { id: string; label: string; test: (p: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "8 caractères", test: (p) => p.length >= 8 && p.length <= 72 },
  { id: "upper", label: "1 majuscule", test: (p) => /\p{Lu}/u.test(p) },
  { id: "lower", label: "1 minuscule", test: (p) => /\p{Ll}/u.test(p) },
  { id: "digit", label: "1 chiffre", test: (p) => /\d/.test(p) },
  { id: "special", label: "1 caractère spécial", test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

export const passwordScore = (p: string) => PASSWORD_RULES.filter((r) => r.test(p)).length;

/** Âge minimum pour créer un compte (le serveur refuse en dessous). Bornes du sélecteur d'âge. */
export const MIN_AGE = 15;
export const AGE_MIN = 13;
export const AGE_MAX = 99;

export const EMAIL_RE = /^[^\s@"(),:;<>[\]\\]{1,64}@(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** Messageries courantes : une adresse proche de l'une d'elles est sans doute une faute de frappe. */
export const EMAIL_DOMAINS = [
  "gmail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.fr", "live.com", "msn.com",
  "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr",
  "laposte.net", "gmx.fr", "proton.me", "protonmail.com", "etu.univ-nantes.fr", "univ-nantes.fr",
];

/** Distance d'édition (insertion, suppression, remplacement d'une lettre). */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = keep;
    }
  }
  return row[b.length];
}

/** « camille@gmial.com » → « camille@gmail.com » ; null si l'adresse n'appelle aucune correction. */
export function suggestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || !EMAIL_RE.test(email)) return null;
  const domain = email.slice(at + 1);
  if (EMAIL_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestD = 3;
  for (const d of EMAIL_DOMAINS) {
    const dd = distance(domain, d);
    if (dd < bestD) { best = d; bestD = dd; }
  }
  return best && bestD <= (domain.length > 6 ? 2 : 1) ? email.slice(0, at + 1) + best : null;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
