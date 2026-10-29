#!/usr/bin/env node
/**
 * Référencement, à la publication : adresse principale du site dans les balises de partage, robots.txt, sitemap.xml,
 * page 404.
 *
 *   node scripts/seo.mjs <dossier publié> [--base /pwa-nantes/] [--mirror]
 *
 *   SITE_URL   adresse principale du site (par défaut https://pwa-nantes.vercel.app), à changer le jour du nom de
 *              domaine (Vercel › Settings › Environment Variables). Les copies du site (GitHub Pages : --mirror)
 *              annoncent cette adresse comme la bonne (canonical) et n'ont pas de sitemap.
 *   --base     chemin du site sur son domaine (« / » par défaut), pour les liens de la page 404
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT = 'https://pwa-nantes.vercel.app';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
/** Pages proposées aux moteurs de recherche (celles qui existent dans le dossier publié). */
export const PAGES = ['', 'app/inscription/', 'app/legal/', 'app/legal/cgu/', 'app/legal/cgv/', 'app/legal/confidentialite/', 'app/legal/mentions-legales/'];

export function siteUrl(raw) {
  const v = String(raw || DEFAULT).trim().replace(/\/+$/, '');
  const u = new URL(v);
  if (u.protocol !== 'https:' || /['"\s<>\\]/.test(v)) throw new Error(`SITE_URL invalide : « ${v} » (adresse https attendue)`);
  return v;
}

export function sitemap(dir, site, today = new Date().toISOString().slice(0, 10)) {
  const urls = PAGES.filter((p) => fs.existsSync(path.join(dir, p, 'index.html')));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((p) => `  <url><loc>${site}/${p}</loc><lastmod>${today}</lastmod>${p ? '' : '<priority>1.0</priority>'}</url>\n`).join('') +
    '</urlset>\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--base');
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : '/';
  const mirror = args.includes('--mirror');
  if (!dir || !/^\/([\w-]+\/)*$/.test(base)) { console.error('usage : node scripts/seo.mjs <dossier> [--base /chemin/] [--mirror]'); process.exit(2); }
  let site;
  try { site = siteUrl(process.env.SITE_URL); } catch (e) { console.error('seo : ' + e.message); process.exit(2); }
  // Balises de partage et adresse canonique de la carte
  const index = path.join(dir, 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  if (!html.includes(DEFAULT + '/')) { console.error('seo : adresse ' + DEFAULT + ' introuvable dans index.html'); process.exit(2); }
  fs.writeFileSync(index, html.split(DEFAULT + '/').join(site + '/'));
  // Page des adresses inconnues
  fs.writeFileSync(path.join(dir, '404.html'), fs.readFileSync(path.join(root, '404.html'), 'utf8').split('{{BASE}}').join(base));
  if (mirror) {
    console.log(`seo : ${dir} — copie de ${site} (pas de sitemap), 404 sous ${base}`);
  } else {
    fs.writeFileSync(path.join(dir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
    fs.writeFileSync(path.join(dir, 'sitemap.xml'), sitemap(dir, site));
    console.log(`seo : ${dir} — ${site}, robots.txt, sitemap.xml, 404`);
  }
}
