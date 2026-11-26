#!/usr/bin/env node
/**
 * Pages des restaurants, générées à la publication (audit du 25 novembre 2026) :
 *   /restaurants/<nom>-<8 premiers caractères de l'identifiant>/   une page par restaurant en ligne (hors fiches de test)
 *   /restaurants/                                                   la liste
 *
 * Pourquoi : la carte est une application (index.html) que Google et les aperçus de liens (WhatsApp, Instagram,
 * Messenger…) ne lisent pas. Ces pages simples donnent à chacun le nom, la photo, l'adresse, les horaires et la carte du
 * restaurant, avec les données structurées « Restaurant » de schema.org, et un bouton vers la fiche sur la carte.
 * Un lien partagé depuis l'application finit par « ?go=1 » : la page ouvre alors aussitôt la fiche sur la carte (les
 * aperçus, eux, lisent la page sans exécuter son script).
 * Les restaurants inscrits après la dernière publication n'ont pas encore de page : la page 404 renvoie leur adresse
 * vers la carte (?rs=…), et la publication quotidienne (GitHub Actions, secret VERCEL_DEPLOY_HOOK) les ajoute.
 *
 *   node scripts/restaurant-pages.mjs <dossier publié>
 *   SITE_URL : adresse principale (https://flashmiam.fr par défaut). Serveur injoignable : aucune page, sans erreur.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { siteUrl } from './seo.mjs';

const SUPABASE_URL = 'https://fnypgfyxbyaqrnklhjxc.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_W-2Gra6O-pRBEf0a_XsyKw_8UlhHTzb';   // publique par nature (règles d'accès de la base)

const CATEGORY = {
  food_truck: ['Food-truck', '🚚'], kebab: ['Kebab', '🥙'], burger: ['Burger', '🍔'], sweets: ['Sucré', '🧁'], pizza: ['Pizza', '🍕'],
  asian: ['Asiatique', '🍣'], tacos: ['Tacos', '🌮'], creperie: ['Crêperie', '🥞'], bakery: ['Boulangerie, snack', '🥐'], cafe: ['Café, salon de thé', '☕'],
  bar: ['Bar', '🍻'], world: ['Cuisine du monde', '🌍'], traditional: ['Traditionnel, brasserie', '🍲'], other: ['Restaurant', '🍽️'],
};
const AMENITIES = { dine_in: 'Sur place', takeaway: 'À emporter', delivery: 'Livraison', terrace: 'Terrasse', vegetarian: 'Végétarien', vegan: 'Vegan',
  halal: 'Halal', gluten_free: 'Sans gluten', card: 'Carte bancaire', wheelchair: 'Accès fauteuil roulant' };
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function slugify(name) {
  return String(name || 'restaurant').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'restaurant';
}
/** Adresse de la page : même calcul que l'application (index.html, restaurantSlug). */
export const slugOf = (m) => slugify(m.name) + '-' + String(m.id).slice(0, 8);
const hhmm = (t) => { const [h, mn] = t.split(':').map(Number); return h + 'h' + (mn ? String(mn).padStart(2, '0') : ''); };

/** Créneaux de chaque jour (0 = dimanche) : horaires par jour s'il y en a, sinon les mêmes chaque jour ouvert. */
export function week(hours) {
  const h = hours || {};
  if (h.days && typeof h.days === 'object') return [0, 1, 2, 3, 4, 5, 6].map((d) => (Array.isArray(h.days[d]) ? h.days[d] : []));
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ((h.closed_on || []).includes(d) ? [] : (h.services || [])));
}
function hoursRows(hours) {
  const w = week(hours);
  return [1, 2, 3, 4, 5, 6, 0].map((d) => `<tr><th scope="row">${DAYS[d]}</th><td>${w[d].length ? w[d].map(([a, b]) => esc(hhmm(a) + ' – ' + hhmm(b))).join(', ') : 'fermé'}</td></tr>`).join('');
}
function priceRange(menu) {
  const prices = (menu || []).filter((it) => Number(it.price) > 0 && !/boisson|dessert|sauce|suppl|extra|accompagnement/i.test(it.section || ''))
    .map((it) => Number(it.price)).sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const median = prices[Math.floor(prices.length / 2)];
  return median < 10 ? '€' : median <= 20 ? '€€' : '€€€';
}
const euros = (n) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/\u202f|\u00a0/g, ' ');
const sha256 = (s) => "'sha256-" + crypto.createHash('sha256').update(s).digest('base64') + "'";

const STYLE = `
:root { --bg: #fbf8f6; --card: #fff; --text: #221a16; --muted: #6d625b; --line: #ece3dd; --accent: #c2410c; --on-accent: #fff; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #17120f; --card: #211a16; --text: #f3ece7; --muted: #b3a69d; --line: #3a2f29; --accent: #ff8a4c; --on-accent: #1a0d07; } }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); }
main { max-width: 760px; margin: 0 auto; padding: 20px max(16px, env(safe-area-inset-left)) 48px max(16px, env(safe-area-inset-right)); }
.top { display: flex; align-items: center; gap: 10px; font-weight: 700; text-decoration: none; color: inherit; }
.top img { border-radius: 9px; }
h1 { margin: 22px 0 4px; font-size: clamp(28px, 6vw, 38px); line-height: 1.15; text-wrap: balance; }
h2 { margin: 30px 0 10px; font-size: 20px; }
.sub { margin: 0; color: var(--muted); }
.cta { display: inline-flex; align-items: center; justify-content: center; min-height: 50px; margin: 18px 0 6px; padding: 0 24px; border-radius: 25px; font-weight: 600; color: var(--on-accent); background: var(--accent); text-decoration: none; }
.photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 18px; }
.photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; background: var(--line); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
.tags li { padding: 3px 10px; border-radius: 999px; font-size: 14px; background: var(--card); border: 1px solid var(--line); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px 4px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
th { font-weight: 500; text-transform: capitalize; width: 40%; }
.menu li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.menu ul { margin: 0; padding: 0; list-style: none; }
.menu small { display: block; color: var(--muted); }
.menu b { font-weight: 500; }
.price { flex: none; font-variant-numeric: tabular-nums; }
.list { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.list a { display: block; padding: 14px 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--line); color: inherit; text-decoration: none; }
.list small { display: block; color: var(--muted); }
footer { margin-top: 36px; font-size: 14px; color: var(--muted); }
footer a { color: inherit; }
`;

function page({ site, title, description, canonical, image, body, jsonld, script }) {
  const scripts = [script].filter(Boolean);   // le bloc ld+json est une donnée : la CSP ne le concerne pas
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' ${SUPABASE_URL} data:; script-src ${scripts.map(sha256).join(' ') || "'none'"}; base-uri 'none'; form-action 'none'`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="FlashMiam" />
<meta property="og:locale" content="fr_FR" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.ico?v=2" sizes="16x16 32x32 48x48" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" sizes="180x180" />
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${script ? `<script>${script}</script>` : ''}
<style>${STYLE}</style>
</head>
<body>
<main>
<a class="top" href="${esc(site)}/"><img src="/icon-192.png?v=2" alt="" width="32" height="32" />FlashMiam</a>
${body}
<footer><a href="${esc(site)}/">Tous les restaurants de La Roche-sur-Yon sur la carte FlashMiam</a> · <a href="${esc(site)}/restaurants/">Liste des restaurants</a> · <a href="${esc(site)}/app/legal/mentions-legales/">Mentions légales</a></footer>
</main>
</body>
</html>
`;
}

export function restaurantPage(m, site, rating) {
  const [catLabel] = CATEGORY[m.category] || CATEGORY.other;
  const slug = slugOf(m);
  const canonical = `${site}/restaurants/${slug}/`;
  const appUrl = `${site}/?r=${encodeURIComponent(m.id)}`;
  const photos = (m.photos_urls || []).filter((u) => /^https:\/\//.test(u));
  const desc = (m.description || '').replace(/\s+/g, ' ').trim();
  const description = `${m.name} : ${catLabel.toLowerCase()} à La Roche-sur-Yon. ${desc}`.slice(0, 300);
  const price = priceRange(m.menu_json);
  const w = week(m.opening_hours);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Restaurant', name: m.name, url: canonical, servesCuisine: catLabel,
    address: { '@type': 'PostalAddress', streetAddress: m.address || '', addressLocality: 'La Roche-sur-Yon', postalCode: '85000', addressCountry: 'FR' },
    ...(m.lat != null ? { geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.lng } } : {}),
    ...(m.phone ? { telephone: m.phone } : {}), ...(photos.length ? { image: photos.slice(0, 5) } : {}), ...(price ? { priceRange: price } : {}),
    ...(desc ? { description: desc } : {}),
    openingHoursSpecification: w.flatMap((slots, d) => slots.map(([a, b]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: SCHEMA_DAYS[d], opens: a, closes: b }))),
    ...(rating && rating.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(rating.average).toFixed(1), reviewCount: rating.count } } : {}),
  };
  // Lien partagé depuis l'application (?go=1) : la fiche sur la carte, tout de suite
  const script = `if(/[?&]go=1(&|$)/.test(location.search))location.replace(${JSON.stringify(appUrl)})`;
  const sections = new Map();
  (m.menu_json || []).forEach((it) => { const k = it.section || 'Carte'; if (!sections.has(k)) sections.set(k, []); sections.get(k).push(it); });
  const amen = (m.amenities || []).filter((a) => AMENITIES[a]);
  const body = `
<h1>${esc(m.name)}</h1>
<p class="sub">${esc(catLabel)}${price ? ' · ' + price : ''}${rating && rating.count ? ` · ★ ${Number(rating.average).toFixed(1).replace('.', ',')} (${rating.count} avis)` : ''} · ${esc(m.address || 'La Roche-sur-Yon')}</p>
<a class="cta" href="${esc(appUrl)}">Voir sur la carte FlashMiam</a>
${desc ? `<p>${esc(desc)}</p>` : ''}
${amen.length || m.accepts_meal_vouchers ? `<ul class="tags">${amen.map((a) => `<li>${esc(AMENITIES[a])}</li>`).join('')}${m.accepts_meal_vouchers ? '<li>Titres-restaurant acceptés</li>' : ''}</ul>` : ''}
${photos.length ? `<div class="photos">${photos.slice(0, 6).map((u, i) => `<img src="${esc(u)}" alt="${esc(m.name)} — photo ${i + 1}" loading="lazy" decoding="async" width="300" height="300" />`).join('')}</div>` : ''}
<h2>Horaires</h2>
<table>${hoursRows(m.opening_hours)}</table>
${sections.size ? `<h2>La carte</h2><div class="menu">${[...sections].map(([k, items]) => `<h3>${esc(k)}</h3><ul>${items.map((it) => `<li><span><b>${esc(it.name)}</b>${it.desc ? `<small>${esc(it.desc)}</small>` : ''}</span>${Number(it.price) > 0 ? `<span class="price">${esc(euros(it.price))}</span>` : ''}</li>`).join('')}</ul>`).join('')}</div>` : ''}
<h2>Infos</h2>
<p>${esc(m.address || '')}${m.phone ? `<br />Téléphone : <a href="tel:${esc(String(m.phone).replace(/\s+/g, ''))}">${esc(m.phone)}</a>` : ''}</p>
<p>Les offres du moment, les stories et les avis sont sur la fiche FlashMiam de ${esc(m.name)}.</p>`;
  return {
    slug,
    html: page({ site, title: `${m.name} · ${catLabel} à La Roche-sur-Yon · FlashMiam`, description, canonical, image: photos[0] || `${site}/og-image.jpg`, body, jsonld, script }),
  };
}

export function listPage(list, site) {
  const body = `
<h1>Les restaurants de La Roche-sur-Yon</h1>
<p class="sub">${list.length ? `${list.length} restaurant${list.length > 1 ? 's' : ''} sur FlashMiam` : 'Les premiers restaurants partenaires arrivent bientôt sur FlashMiam.'}</p>
<a class="cta" href="${esc(site)}/">Ouvrir la carte</a>
<ul class="list">${list.map((m) => `<li><a href="${esc(site)}/restaurants/${slugOf(m)}/"><b>${esc(m.name)}</b><small>${esc((CATEGORY[m.category] || CATEGORY.other)[0])} · ${esc(m.address || '')}</small></a></li>`).join('')}</ul>`;
  return page({ site, title: 'Les restaurants de La Roche-sur-Yon · FlashMiam', description: 'Restaurants, food-trucks et street food de La Roche-sur-Yon : horaires, cartes et bons plans sur FlashMiam.',
    canonical: `${site}/restaurants/`, image: `${site}/og-image.jpg`, body });
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage : node scripts/restaurant-pages.mjs <dossier publié>'); process.exit(2); }
  const site = siteUrl(process.env.SITE_URL);
  let merchants = [], ratings = new Map();
  try {
    const cols = 'id,name,category,description,address,lat,lng,phone,opening_hours,menu_json,photos_urls,accepts_meal_vouchers,amenities,status,is_open,is_test';
    merchants = await fetchJson(`${SUPABASE_URL}/rest/v1/merchants?select=${cols}&status=eq.published&is_open=eq.true${process.env.PAGES_WITH_TESTS === '1' ? '' : '&is_test=eq.false'}&order=name`);   // PAGES_WITH_TESTS=1 : essai local
    try {
      const r = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/merchant_ratings`, { method: 'POST', body: '{}' });
      ratings = new Map((r || []).map((x) => [x.merchant_id, { average: x.average, count: x.total }]));
    } catch (e) { console.warn('restaurant-pages : notes indisponibles (' + e.message + ')'); }
  } catch (e) {
    console.warn('restaurant-pages : restaurants indisponibles (' + e.message + ') — pages non générées');
  }
  const out = path.join(dir, 'restaurants');
  fs.mkdirSync(out, { recursive: true });
  for (const m of merchants) {
    const { slug, html } = restaurantPage(m, site, ratings.get(m.id));
    fs.mkdirSync(path.join(out, slug), { recursive: true });
    fs.writeFileSync(path.join(out, slug, 'index.html'), html);
  }
  fs.writeFileSync(path.join(out, 'index.html'), listPage(merchants, site));
  // Plan du site : la liste et chaque restaurant
  const sm = path.join(dir, 'sitemap.xml');
  if (fs.existsSync(sm)) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = ['restaurants/', ...merchants.map((m) => `restaurants/${slugOf(m)}/`)].map((p) => `  <url><loc>${site}/${p}</loc><lastmod>${today}</lastmod></url>\n`).join('');
    fs.writeFileSync(sm, fs.readFileSync(sm, 'utf8').replace('</urlset>', urls + '</urlset>'));
  }
  console.log(`restaurant-pages : ${merchants.length} page(s) dans ${out}`);
}
