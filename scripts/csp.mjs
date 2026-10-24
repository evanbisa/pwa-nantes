#!/usr/bin/env node
/**
 * Politique de sécurité du contenu (CSP) des pages du site : liste fermée des sources autorisées.
 * Les scripts écrits dans la page sont autorisés par leur empreinte (SHA-256) : un script injecté (XSS) ne l'est pas.
 *
 *   node scripts/csp.mjs              met à jour la balise <meta http-equiv="Content-Security-Policy"> des pages
 *   node scripts/csp.mjs --check      vérifie qu'elle est à jour (code de sortie 1 sinon)
 *   node scripts/csp.mjs dist/index.html …   pages à traiter (par défaut : celles du site, à la racine du dépôt)
 *
 * À relancer après chaque modification d'un <script> de la page (la publication le fait aussi d'elle-même).
 * Clé Google Maps ajoutée un jour (CONFIG.googleMapsApiKey) : autoriser aussi Google Maps ci-dessous
 * (voir « Content Security Policy » dans la documentation Google Maps).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE = 'https://fnypgfyxbyaqrnklhjxc.supabase.co';
const GOOGLE_SIGN_IN = 'https://accounts.google.com/gsi/';

/** Politique de la page principale (index.html). */
function appPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes.map((h) => `'sha256-${h}'`), GOOGLE_SIGN_IN + 'client'].join(' '),
    `style-src 'self' 'unsafe-inline' ${GOOGLE_SIGN_IN}style`,
    `img-src 'self' data: blob: ${SUPABASE}`,
    "font-src 'self'",
    `connect-src 'self' ${SUPABASE} ${SUPABASE.replace('https://', 'wss://')} https://tiles.openfreemap.org https://data.geopf.fr ${GOOGLE_SIGN_IN}`,
    `frame-src ${GOOGLE_SIGN_IN}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self' blob:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
}
/** Pages de texte (confidentialité, conditions) : aucun script. */
const textPolicy = () => ["default-src 'self'", "script-src 'none'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');

const PAGES = { 'index.html': appPolicy, 'confidentialite.html': textPolicy, 'conditions.html': textPolicy };
const META = /<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>/;

export function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
export function withPolicy(html, policyFor) {
  if (!META.test(html)) throw new Error('balise <meta http-equiv="Content-Security-Policy" … /> introuvable');
  const hashes = inlineScripts(html).map((code) => createHash('sha256').update(code, 'utf8').digest('base64'));
  return html.replace(META, `<meta http-equiv="Content-Security-Policy" content="${policyFor(hashes)}" />`);
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const files = args.filter((a) => a !== '--check');
const targets = files.length ? files : Object.keys(PAGES).map((f) => path.join(root, f));
let stale = 0;
for (const file of targets) {
  const policyFor = PAGES[path.basename(file)];
  if (!policyFor) { console.error(`csp : page inconnue ${file}`); process.exit(2); }
  const html = fs.readFileSync(file, 'utf8');
  const next = withPolicy(html, policyFor);
  if (next === html) continue;
  if (check) { console.error(`csp : politique à mettre à jour dans ${file} (node scripts/csp.mjs)`); stale++; }
  else { fs.writeFileSync(file, next); console.log(`csp : ${file} mis à jour`); }
}
if (stale) process.exit(1);
