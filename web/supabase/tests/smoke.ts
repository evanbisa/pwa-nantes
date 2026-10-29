/// <reference lib="deno.ns" />
// Tests « de bout en bout » contre le vrai projet Supabase et le vrai répertoire Sirene (lancés par GitHub Actions).
// deno run --allow-net --allow-env supabase/tests/smoke.ts
import { checkSireneResponse, isValidSiret, sireneUrl } from "../functions/verify-siret/siret.ts";

const URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const KEY = Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!;
const FN = `${URL}/functions/v1/verify-siret`;
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "✔" : "✘"} ${msg}`); if (!ok) failures++; };

// 1. La fonction refuse tout appel sans session valide
const post = (headers: Record<string, string>) =>
  fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, ...headers }, body: JSON.stringify({ siret: "12345678900017" }) });
let r = await post({ Origin: "https://roche-street-food.pages.dev" });
let body = await r.json().catch(() => ({}));
check(r.status === 401 && body.error === "unauthenticated", `verify-siret sans session : refusé (HTTP ${r.status} ${body.error ?? ""})`);
r = await post({ Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwaXJhdGUifQ.faux" });
body = await r.json().catch(() => ({}));
check(r.status === 401, `verify-siret avec un jeton forgé : refusé (HTTP ${r.status})`);
r = await fetch(FN, { method: "OPTIONS", headers: { Origin: "https://roche-street-food.pages.dev", "Access-Control-Request-Method": "POST" } });
await r.body?.cancel();
check(r.ok && r.headers.get("access-control-allow-origin") === "https://roche-street-food.pages.dev", `CORS : site autorisé (HTTP ${r.status})`);
r = await fetch(FN, { method: "OPTIONS", headers: { Origin: "https://pirate.example", "Access-Control-Request-Method": "POST" } });
await r.body?.cancel();
check(!r.headers.get("access-control-allow-origin"), "CORS : site inconnu non autorisé");

// 1 bis. Alertes push : clé publique VAPID disponible ; requêtes invalides refusées ; suppression de compte protégée
const PUSH = `${URL}/functions/v1/send-push`;
r = await fetch(PUSH, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Origin: "https://pwa-nantes.vercel.app" }, body: JSON.stringify({ action: "key" }) });
body = await r.json().catch(() => ({}));
check(r.status === 200 && /^[A-Za-z0-9_-]{87}$/.test(body.publicKey ?? "") && r.headers.get("access-control-allow-origin") === "https://pwa-nantes.vercel.app",
  `send-push : clé publique des alertes (HTTP ${r.status}, ${String(body.publicKey ?? "").length} caractères)`);
r = await fetch(PUSH, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify({ action: "send", merchant_id: "'; drop table" }) });
await r.body?.cancel();
check(r.status === 400, `send-push : restaurant invalide refusé (HTTP ${r.status})`);
r = await fetch(PUSH, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: JSON.stringify({ action: "send", merchant_id: "00000000-0000-4000-8000-000000000000" }) });
body = await r.json().catch(() => ({}));
check(r.status === 200 && body.sent === 0, `send-push : rien à envoyer pour un restaurant inconnu (HTTP ${r.status})`);
r = await fetch(`${URL}/functions/v1/delete-account`, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY }, body: "{}" });
body = await r.json().catch(() => ({}));
check(r.status === 401 && body.error === "unauthenticated", `delete-account sans session : refusé (HTTP ${r.status})`);

// 2. Le répertoire Sirene répond au format attendu, pour un vrai restaurant de La Roche-sur-Yon
type Etab = { siret: string; etat_administratif: string; activite_principale?: string; code_postal?: string };
const search = await fetch("https://recherche-entreprises.api.gouv.fr/search?q=restaurant&code_postal=85000&per_page=25");
const list = await search.json().catch(() => ({}));
// Établissements candidats : ceux qui correspondent à la recherche, sinon le siège
const candidates: Etab[] = (list.results ?? []).flatMap((u: { matching_etablissements?: Etab[]; siege?: Etab }) =>
  [...(u.matching_etablissements ?? []), ...(u.siege ? [u.siege] : [])]);
const siret = candidates.find((e) => e.etat_administratif === "A" && /^56\./.test(e.activite_principale ?? "") && e.code_postal === "85000")?.siret;
if (!siret) console.log(`  (diagnostic : HTTP ${search.status}, ${list.total_results ?? "?"} résultats, ${candidates.length} établissements, clés : ${Object.keys(list.results?.[0] ?? {}).join(", ")})`);
check(typeof siret === "string" && isValidSiret(siret), `Sirene : restaurant réel trouvé à La Roche-sur-Yon (SIRET ${siret}, clé de contrôle valide)`);
if (siret) {
  const res = await fetch(sireneUrl(siret));
  const result = checkSireneResponse(siret, await res.json());
  check(result.ok, `Sirene : analyse de la fiche réelle → ${result.ok ? `${result.company.tradeName ?? result.company.legalName}, NAF ${result.company.naf}, coordonnées ${result.company.lat !== null ? "dans la zone" : "absentes"}` : result.message}`);
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est en ordre ✔");
Deno.exit(failures ? 1 : 0);
