#!/usr/bin/env node
/**
 * Allège les pages publiées : scripts et styles écrits dans la page passés à esbuild (espaces, commentaires et noms
 * locaux raccourcis), commentaires HTML retirés. Le fichier du dépôt n'est jamais modifié : seulement la copie publiée.
 *
 *   node scripts/minify.mjs dist/index.html …
 *
 * À lancer APRÈS scripts/config.mjs et AVANT scripts/csp.mjs (les empreintes CSP portent sur le script final).
 * esbuild est une dépendance de développement de web/ (installée par « npm ci » dans web/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const esbuild = createRequire(path.join(root, 'web', 'package.json'))('esbuild');

export async function minifyHtml(html) {
  // Scripts écrits dans la page (pas les données JSON-LD, ni les scripts chargés par adresse)
  const parts = [];
  const re = /(<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>)([\s\S]*?)(<\/script>)|(<style>)([\s\S]*?)(<\/style>)/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    parts.push(html.slice(last, m.index));
    if (m[1]) {
      const { code } = await esbuild.transform(m[2], { loader: 'js', minify: true, target: 'es2020', legalComments: 'none' });
      parts.push(m[1] + code.trim() + m[3]);
    } else {
      const { code } = await esbuild.transform(m[5], { loader: 'css', minify: true, legalComments: 'none' });
      parts.push(m[4] + code.trim() + m[6]);
    }
    last = re.lastIndex;
  }
  parts.push(html.slice(last));
  // Commentaires HTML (hors scripts, déjà traités) et lignes vides
  return parts.join('').replace(/<!--(?!\[)[\s\S]*?-->/g, '').replace(/\n\s*\n+/g, '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage : node scripts/minify.mjs <page.html> …'); process.exit(2); }
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = await minifyHtml(before);
    fs.writeFileSync(file, after);
    console.log(`minify : ${file} — ${Math.round(before.length / 1024)} Ko → ${Math.round(after.length / 1024)} Ko`);
  }
}
