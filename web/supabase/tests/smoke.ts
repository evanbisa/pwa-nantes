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
