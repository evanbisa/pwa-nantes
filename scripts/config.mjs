#!/usr/bin/env node
/**
 * Réglages du site lus à la publication (variables d'environnement), écrits dans CONFIG de la page.
 *
 *   MAP_STYLE   style de la carte : flashmiam (par défaut : urbain le jour, néon la nuit), google, neon, pastel, urbain,
 *               ou l'adresse https d'un style MapLibre
 *
 *   node scripts/config.mjs dist/index.html …   pages à régler (par défaut : index.html à la racine du dépôt)
 *
 * Valeurs prises dans l'environnement (Vercel › Settings › Environment Variables, variables du dépôt GitHub),
 * sinon dans le fichier .env à la racine du dépôt (voir .env.example). À lancer AVANT scripts/csp.mjs :
 * changer le script de la page change son empreinte, et un style externe ajoute son domaine à la politique.
 */
import fs from 'node:fs';
import path from 'node:path';

const STYLES = ['flashmiam', 'google', 'neon', 'pastel', 'urbain'];
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

/** Fichier .env : lignes CLE=valeur, commentaires (#) et guillemets ignorés. */
export function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Valeur de MAP_STYLE vérifiée ; null = absente (la page garde son réglage). */
export function mapStyleValue(raw) {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  if (STYLES.includes(v)) return v;
  let url;
  try { url = new URL(v); } catch (e) { url = null; }
  if (url && url.protocol === 'https:' && !/['"\s\\]/.test(v)) return v;
  throw new Error(`MAP_STYLE invalide : « ${v} ». Valeurs possibles : ${STYLES.join(', ')}, ou l'adresse https d'un style MapLibre.`);
}

const LINE = /^(\s*mapStyle:\s*)'[^']*'(,)/m;
export function withMapStyle(html, value) {
  if (!LINE.test(html)) throw new Error('ligne « mapStyle: … » introuvable dans CONFIG');
  return html.replace(LINE, `$1'${value}'$2`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = { ...readEnvFile(path.join(root, '.env')), ...process.env };
  let value;
  try { value = mapStyleValue(env.MAP_STYLE); } catch (e) { console.error('config : ' + e.message); process.exit(2); }
  const files = process.argv.slice(2);
  for (const file of files.length ? files : [path.join(root, 'index.html')]) {
    if (value === null) { console.log(`config : ${file} — MAP_STYLE non défini, style inchangé`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const next = withMapStyle(html, value);
    if (next !== html) fs.writeFileSync(file, next);
    console.log(`config : ${file} — carte « ${value} »`);
  }
}
