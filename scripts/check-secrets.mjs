#!/usr/bin/env node
/**
 * Contrôle des secrets : aucun fichier du dépôt ne doit contenir de clé secrète, de mot de passe ou de clé privée.
 * Lancé à chaque modification par GitHub Actions (.github/workflows/secrets.yml) ; en local : node scripts/check-secrets.mjs
 *
 * Les valeurs PUBLIQUES par nature (clé publiable Supabase « sb_publishable_… », identifiant client Google, clé de site
 * Turnstile) sont autorisées. Les secrets, eux, ne vont que dans les réglages des services (Supabase › Edge Functions ›
 * Secrets, GitHub › Settings › Secrets), jamais dans un fichier.
 * Sortie : liste des fichiers et lignes en cause (sans jamais afficher le secret lui-même), code 1 si un secret est trouvé.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Fichiers ignorés : bibliothèques tierces publiées telles quelles et fichiers binaires. */
const SKIP = /^vendor\/|(^|\/)package-lock\.json$|\.(png|jpe?g|webp|gif|ico|woff2?|pbf|gz|pdf|zip)$/i;

/** [nom, expression]. Les exemples factices (« sb_secret_xxxx », « … ») ne déclenchent pas d'alerte. */
const RULES = [
  ["clé secrète Supabase", /sb_secret_(?!x{4,}|…)[A-Za-z0-9_-]{16,}/],
  ["clé service_role Supabase (jeton JWT)", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["clé d'API Whop", /\b(?:apik|whop)_[A-Za-z0-9]{24,}/],
  ["secret de webhook (Whop, Standard Webhooks)", /\bwhsec_[A-Za-z0-9+/=]{20,}|\bws_(?!test_)[A-Za-z0-9]{24,}/],
  ["clé d'API Resend", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["clé SMTP Brevo", /\bxkeysib-[a-f0-9]{32,}/],
  ["secret client Google OAuth", /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
  ["jeton GitHub", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ["clé Stripe", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/],
  ["clé AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["clé privée", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ["adresse de base de données avec mot de passe", /postgres(?:ql)?:\/\/[^:\s/@]+:(?!\[|\$\{|<|\*{3})[^@\s'"]{6,}@(?!localhost|127\.0\.0\.1)/],
];

/** Un jeton JWT n'est un secret que s'il porte le rôle service_role (la clé anon, elle, est publique). */
function isSecretJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "service_role" || payload.role === "supabase_admin";
  } catch {
    return false;
  }
}

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter((f) => f && !SKIP.test(f));
const findings = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  if (text.includes("\0")) continue; // fichier binaire
  text.split("\n").forEach((line, i) => {
    for (const [name, re] of RULES) {
      const m = line.match(re);
      if (!m) continue;
      if (name.startsWith("clé service_role") && !isSecretJwt(m[0])) continue;
      findings.push(`${file}:${i + 1} : ${name}`);
    }
  });
}

if (findings.length) {
  console.error(`✘ ${findings.length} secret(s) possible(s) dans le dépôt (valeurs masquées) :\n  ` + findings.join("\n  "));
  console.error("Retirez-les du fichier, changez-les dans le service concerné (ils sont compromis), puis rangez-les dans ses réglages.");
  process.exit(1);
}
console.log(`✔ Aucun secret dans les ${files.length} fichiers du dépôt.`);
