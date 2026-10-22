#!/usr/bin/env node
/**
 * Vérifie la connexion à Supabase ET ce qu'un visiteur anonyme peut lire avec la clé publique
 * (exactement ce que verrait quelqu'un depuis l'inspecteur web).
 *
 * Usage : npm run db:check   (lit .env.local)
 */
import { readFileSync, existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("✘ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY manquante dans .env.local");
  process.exit(1);
}
if (process.env.SUPABASE_SECRET_KEY && key === process.env.SUPABASE_SECRET_KEY) {
  console.error("✘ DANGER : la clé publique est identique à la clé secrète. Utilisez la clé « publishable ».");
  process.exit(1);
}
if (/^sb_secret_/.test(key) || /service_role/.test(Buffer.from(key.split(".")[1] ?? "", "base64").toString())) {
  console.error("✘ DANGER : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contient une clé SECRÈTE. Remplacez-la par la clé « publishable ».");
  process.exit(1);
}

// Anciennes clés « anon » (JWT) : aussi envoyées en Authorization. Nouvelles clés « sb_publishable_ » : apikey seule.
const headers = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
const get = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  let body = null;
  try { body = await res.json(); } catch { /* corps vide */ }
  return { status: res.status, body };
};

let failures = 0;
const report = (ok, msg) => { console.log(`${ok ? "✔" : "✘"} ${msg}`); if (!ok) failures++; };

const merchants = await get("merchants?select=id,name,status,menu_json&limit=5");
report(merchants.status === 200 && Array.isArray(merchants.body),
  `connexion OK — fiches publiques lisibles (${Array.isArray(merchants.body) ? merchants.body.length : "?"} affichée(s), HTTP ${merchants.status})`);
if (merchants.status === 200 && merchants.body.some((m) => m.status !== "published")) report(false, "une fiche NON publiée est visible publiquement");

const denied = (r) => r.status === 401 || r.status === 403 || r.status === 404 || (r.status === 200 && Array.isArray(r.body) && r.body.length === 0);
for (const [path, label] of [
  ["merchant_private?select=siret&limit=1", "SIRET (merchant_private)"],
  ["profiles?select=*&limit=1", "profils (prénom, nom, téléphone)"],
  ["users?select=email&limit=1", "comptes Supabase Auth (e-mails, mots de passe)"],
  ["notifications?select=*&limit=1", "notifications des comptes"],
  ["push_subscriptions?select=*&limit=1", "appareils abonnés aux alertes"],
  ["push_config?select=*&limit=1", "clés du serveur d'alertes"],
]) {
  const r = await get(path);
  report(denied(r), `${label} : inaccessible pour un visiteur (HTTP ${r.status})`);
}

const reviews = await get("reviews?select=id,author_name,rating&limit=5");
report(reviews.status === 200 && Array.isArray(reviews.body), `avis publics lisibles (HTTP ${reviews.status})`);
const ratings = await fetch(`${url}/rest/v1/rpc/merchant_ratings`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
report(ratings.status === 200, `notes moyennes lisibles (HTTP ${ratings.status})`);
await ratings.body?.cancel();
const claim = await fetch(`${url}/rest/v1/rpc/claim_pending_pushes`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
report(claim.status === 401 || claim.status === 403 || claim.status === 404, `file d'envoi des alertes : réservée au serveur (HTTP ${claim.status})`);
await claim.body?.cancel();
const fakeReview = await fetch(`${url}/rest/v1/reviews`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ merchant_id: "00000000-0000-0000-0000-000000000000", rating: 5 }) });
report(fakeReview.status >= 400, `avis anonyme : refusé (HTTP ${fakeReview.status})`);
await fakeReview.body?.cancel();

const write = await fetch(`${url}/rest/v1/merchants`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ name: "test" }) });
const written = write.status === 200 ? await write.json() : [];
report(write.status >= 400 || written.length === 0, `modification anonyme d'une fiche : refusée (HTTP ${write.status})`);

console.log(failures ? `\n${failures} problème(s) détecté(s)` : "\nTout est en ordre ✔");
process.exit(failures ? 1 : 0);
