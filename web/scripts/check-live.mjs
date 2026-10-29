#!/usr/bin/env node
/**
 * Vérifie les sites EN LIGNE, comme un visiteur :
 *  - aucune clé secrète dans les pages et les scripts publiés (Supabase secret / service_role, secret Google, clé privée…) ;
 *  - seules des clés publiques par nature (publishable Supabase, identifiant client Google) ;
 *  - politique de sécurité du contenu (CSP) présente, scripts autorisés par empreinte seulement ;
 *  - en-têtes de sécurité (Vercel) : HTTPS forcé, pas d'intégration dans un autre site, etc.
 *
 * Usage : node scripts/check-live.mjs
 * Juste après une publication, le nouveau site peut mettre quelques minutes à arriver : on réessaie jusqu'à 6 minutes.
 */
const SITES = [
  { name: "Vercel", url: "https://pwa-nantes.vercel.app/", headers: true },
  { name: "GitHub Pages", url: "https://evanbisa.github.io/pwa-nantes/", headers: false },
];
const SECRETS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "clé secrète Supabase (sb_secret_…)"],
  [/GOCSPX-[A-Za-z0-9_-]{10,}/, "secret du client Google"],
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, "clé privée"],
  [/"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/, "clé privée VAPID (JWK)"],
  [/sk_live_[A-Za-z0-9]{10,}|rk_live_[A-Za-z0-9]{10,}/, "clé secrète Stripe"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, "jeton GitHub"],
];
const HEADERS = [
  ["strict-transport-security", /max-age=\d{7,}/],
  ["x-frame-options", /^DENY$/i],
  ["x-content-type-options", /^nosniff$/i],
  ["content-security-policy", /frame-ancestors 'none'/],
  ["cross-origin-opener-policy", /same-origin/],
  ["referrer-policy", /strict-origin/],
];

let failures = 0;
const report = (ok, msg) => { console.log(`${ok ? "✔" : "✘"} ${msg}`); if (!ok) failures++; };
/** Anciennes clés Supabase (jetons JWT) : seule la clé « anon » est publique ; « service_role » est secrète. */
const secretJwts = (body) => [...body.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)].filter((m) => {
  try { return JSON.parse(Buffer.from(m[1], "base64url").toString()).role === "service_role"; } catch { return false; }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (url) => { const r = await fetch(url, { redirect: "follow" }); return { status: r.status, headers: r.headers, body: await r.text() }; };

for (const site of SITES) {
  let page = null;
  for (let i = 0; i < 12; i++) {
    try { page = await text(site.url); } catch { page = { status: 0, headers: new Headers(), body: "" }; }
    if (page.status === 200 && page.body.includes('http-equiv="Content-Security-Policy"')) break;
    await sleep(30000);
  }
  report(page.status === 200, `${site.name} : site joignable (HTTP ${page.status})`);
  if (page.status !== 200) continue;

  // Pages et scripts du site (le fichier de la carte MapLibre, bibliothèque tierce connue, est exclu)
  const files = [[site.url, page.body]];
  const scripts = [...page.body.matchAll(/<script[^>]*\bsrc="([^"]+)"/g), ...page.body.matchAll(/s\.src = '([^']+\.js)'/g)].map((m) => new URL(m[1], site.url).href);
  for (const extra of ["sw.js", "confidentialite.html", "conditions.html", "app/", "app/legal/cgu/", "app/legal/confidentialite/"]) scripts.push(new URL(extra, site.url).href);
  for (const url of [...new Set(scripts)].filter((u) => u.startsWith(new URL(site.url).origin) && !u.includes("maplibre"))) {
    try { const f = await text(url); if (f.status === 200) files.push([url, f.body]); } catch { /* fichier absent */ }
  }
  const app = files.find(([u]) => u.endsWith("/app/"));
  if (app) for (const m of app[1].matchAll(/src="([^"]+\/_next\/[^"]+\.js)"/g)) {
    try { const f = await text(new URL(m[1], site.url).href); if (f.status === 200) files.push([m[1], f.body]); } catch { /* ignoré */ }
  }
  const found = [];
  for (const [url, body] of files) {
    for (const [re, label] of SECRETS) if (re.test(body)) found.push(`${label} dans ${url}`);
    if (secretJwts(body).length) found.push(`ancienne clé service_role Supabase dans ${url}`);
  }
  report(found.length === 0, `${site.name} : aucune clé secrète dans ${files.length} fichiers publiés${found.length ? " : " + found.join(" ; ") : ""}`);
  // Clés repérées dans la page : chacune doit être d'un type public (affichées tronquées dans le rapport)
  const keys = [...new Set([...page.body.matchAll(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+|[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/g)].map((m) => m[0]))];
  const isPublic = (k) => k.startsWith("sb_publishable_") || k.endsWith(".apps.googleusercontent.com");
  report(keys.length > 0 && keys.every(isPublic), `${site.name} : seules des clés publiques par nature (${keys.map((k) => k.slice(0, 18) + "…").join(", ")})`);

  const csp = (page.body.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || "";
  report(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+/.test(csp) && !/unsafe-inline[^;]*;?/.test(csp.match(/script-src[^;]*/)?.[0] || "") && /object-src 'none'/.test(csp),
    `${site.name} : politique CSP active (scripts autorisés par empreinte, pas de script injecté)`);

  if (site.headers) for (const [name, re] of HEADERS) {
    const v = page.headers.get(name) || "";
    report(re.test(v), `${site.name} : en-tête ${name}${v ? " = " + v : " absent"}`);
  }
}
console.log(failures ? `\n${failures} problème(s) détecté(s)` : "\nTout est en ordre ✔");
process.exit(failures ? 1 : 0);
