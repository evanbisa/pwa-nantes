#!/usr/bin/env node
/**
 * Politique de sécurité du contenu (CSP) des pages de l'application (export statique de Next.js, dossier out/).
 * Lancé automatiquement après « npm run build » (script postbuild).
 *
 * Les scripts écrits dans les pages (données de Next.js) sont autorisés par leur empreinte SHA-256, calculée ici page par
 * page : un script injecté (XSS) ne l'est pas. Les autres sources sont une liste fermée : le site lui-même, Supabase
 * (adresse lue dans NEXT_PUBLIC_SUPABASE_URL), la connexion avec Google et l'anti-robots Cloudflare Turnstile.
 * La balise est placée en tête de <head>, avant tout script, pour s'appliquer à toute la page.
 *
 *   node scripts/csp-app.mjs [dossier]   (par défaut : out)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const GOOGLE = "https://accounts.google.com/gsi/";
const TURNSTILE = "https://challenges.cloudflare.com";

export function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

export function policy(hashes, supabaseUrl) {
  const api = new URL(supabaseUrl);
  const ws = (api.protocol === "https:" ? "wss://" : "ws://") + api.host;
  return [
    "default-src 'self'",
    ["script-src 'self'", ...hashes.map((h) => `'sha256-${h}'`), GOOGLE + "client", TURNSTILE].join(" "),
    `style-src 'self' 'unsafe-inline' ${GOOGLE}style`,
    `img-src 'self' data: blob: ${api.origin}`,
    "font-src 'self'",
    `connect-src 'self' ${api.origin} ${ws} ${GOOGLE} ${TURNSTILE}`,
    `frame-src ${GOOGLE} ${TURNSTILE}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/** Page avec sa CSP (remplace celle d'un passage précédent). */
export function withPolicy(html, supabaseUrl) {
  const clean = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*"\/?>/, "");
  const hashes = [...new Set(inlineScripts(clean).map((code) => createHash("sha256").update(code, "utf8").digest("base64")))];
  if (!/<head>/.test(clean)) throw new Error("balise <head> introuvable");
  return clean.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy(hashes, supabaseUrl)}"/>`);
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? htmlFiles(f) : e.name.endsWith(".html") ? [f] : [];
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? "out";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? fs.readFileSync(".env.production", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  if (!supabaseUrl) { console.error("csp-app : NEXT_PUBLIC_SUPABASE_URL introuvable"); process.exit(2); }
  if (!fs.existsSync(dir)) { console.error(`csp-app : dossier ${dir} introuvable (lancer après next build)`); process.exit(2); }
  const files = htmlFiles(dir);
  for (const f of files) fs.writeFileSync(f, withPolicy(fs.readFileSync(f, "utf8"), supabaseUrl));
  console.log(`csp-app : politique de sécurité posée sur ${files.length} pages (${new URL(supabaseUrl).origin})`);
}
