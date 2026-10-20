// Tests de la fonction verify-siret, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { handle, type Deps } from "./handler.ts";
import { checkSireneResponse, isValidSiret } from "./siret.ts";

const luhn = (base13: string) => {
  for (let k = 0; k < 10; k++) if (isValidSiret(base13 + k)) return base13 + k;
  throw new Error("pas de clé");
};
const SIRET = luhn("1234567890001");
const OTHER = luhn("9876543210001");
const etab = (extra: Record<string, unknown> = {}) => ({
  siret: SIRET, etat_administratif: "A", activite_principale: "56.10C", adresse: "12 PLACE NAPOLEON 85000 LA ROCHE-SUR-YON",
  latitude: "46.6706", longitude: "-1.4268", liste_enseignes: ["LE BON BURGER"], ...extra,
});
const sireneBody = (e = etab()) => ({ results: [{ siren: SIRET.slice(0, 9), nom_complet: "SAS LE BON BURGER", matching_etablissements: [e] }] });

function fakeDeps(over: Partial<Deps> = {}) {
  const calls: Record<string, unknown[]> = { create: [], save: [] };
  const deps: Deps = {
    getUserId: (t) => Promise.resolve(t === "jeton-valide" ? "user-1" : null),
    getRole: () => Promise.resolve("merchant"),
    findSiretOwner: () => Promise.resolve(null),
    getMyMerchant: () => Promise.resolve(null),
    fetchSirene: () => Promise.resolve({ ok: true, status: 200, body: sireneBody() }),
    createMerchant: (row) => { calls.create.push(row); return Promise.resolve("merchant-1"); },
    saveVerification: (id, c) => { calls.save.push({ id, siret: c.siret, naf: c.naf }); return Promise.resolve(); },
    ...over,
  };
  return { deps, calls };
}
const req = (body: unknown, { token = "jeton-valide", method = "POST", origin = "https://roche-street-food.pages.dev" } = {}) =>
  new Request("https://x.supabase.co/functions/v1/verify-siret", {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: origin },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
const call = async (r: Request, deps: Deps) => { const res = await handle(r, deps); return { status: res.status, body: res.status === 204 ? null : await res.json(), res }; };

Deno.test("succès : fiche créée en brouillon, SIRET enregistré, nom = enseigne", async () => {
  const { deps, calls } = fakeDeps();
  const r = await call(req({ siret: SIRET.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 ") }), deps);
  assertEquals(r.status, 200);
  assertEquals(r.body.merchant_id, "merchant-1");
  assertEquals(calls.create, [{ user_id: "user-1", name: "Le Bon Burger", address: "12 PLACE NAPOLEON 85000 LA ROCHE-SUR-YON", lat: 46.6706, lng: -1.4268 }]);
  assertEquals(calls.save, [{ id: "merchant-1", siret: SIRET, naf: "56.10C" }]);
  assertEquals(r.res.headers.get("Access-Control-Allow-Origin"), "https://roche-street-food.pages.dev");
});
Deno.test("fiche existante : pas de nouvelle fiche, vérification mise à jour", async () => {
  const { deps, calls } = fakeDeps({ getMyMerchant: () => Promise.resolve({ id: "m-exist", status: "draft", siret: null }) });
  const r = await call(req({ siret: SIRET }), deps);
  assertEquals(r.status, 200);
  assertEquals(calls.create.length, 0);
  assertEquals((calls.save[0] as { id: string }).id, "m-exist");
});
Deno.test("non connecté → 401 ; étudiant → 403", async () => {
  assertEquals((await call(req({ siret: SIRET }, { token: "faux" }), fakeDeps().deps)).status, 401);
  assertEquals((await call(req({ siret: SIRET }), fakeDeps({ getRole: () => Promise.resolve("student") }).deps)).status, 403);
});
Deno.test("SIRET mal formé ou clé de contrôle fausse → 400", async () => {
  assertEquals((await call(req({ siret: "123" }), fakeDeps().deps)).body.error, "invalid_siret");
  assertEquals((await call(req({ siret: SIRET.slice(0, 13) + ((Number(SIRET[13]) + 1) % 10) }), fakeDeps().deps)).status, 400);
});
Deno.test("SIRET déjà pris par un autre → 409 ; changement de SIRET sur fiche en ligne → 409", async () => {
  const taken = fakeDeps({ findSiretOwner: () => Promise.resolve({ merchantId: "x", userId: "user-2" }) });
  assertEquals((await call(req({ siret: SIRET }), taken.deps)).body.error, "siret_taken");
  const locked = fakeDeps({ getMyMerchant: () => Promise.resolve({ id: "m", status: "published", siret: OTHER }) });
  assertEquals((await call(req({ siret: SIRET }), locked.deps)).body.error, "siret_locked");
  const race = fakeDeps({ saveVerification: () => Promise.reject({ code: "23505" }) });
  assertEquals((await call(req({ siret: SIRET }), race.deps)).body.error, "siret_taken");
});
Deno.test("Sirene : fermé, hors restauration, introuvable, indisponible", async () => {
  const closed = fakeDeps({ fetchSirene: () => Promise.resolve({ ok: true, status: 200, body: sireneBody(etab({ etat_administratif: "F" })) }) });
  assertEquals((await call(req({ siret: SIRET }), closed.deps)).body.error, "closed");
  const naf = fakeDeps({ fetchSirene: () => Promise.resolve({ ok: true, status: 200, body: sireneBody(etab({ activite_principale: "62.01Z" })) }) });
  assertEquals((await call(req({ siret: SIRET }), naf.deps)).body.error, "naf");
  const none = fakeDeps({ fetchSirene: () => Promise.resolve({ ok: true, status: 200, body: { results: [] } }) });
  assertEquals((await call(req({ siret: SIRET }), none.deps)).status, 404);
  const down = fakeDeps({ fetchSirene: () => Promise.resolve({ ok: false, status: 503, body: null }) });
  assertEquals((await call(req({ siret: SIRET }), down.deps)).status, 502);
  const net = fakeDeps({ fetchSirene: () => Promise.reject(new Error("timeout")) });
  assertEquals((await call(req({ siret: SIRET }), net.deps)).status, 502);
});
Deno.test("adresse hors zone : fiche créée sans coordonnées", () => {
  const r = checkSireneResponse(SIRET, sireneBody(etab({ latitude: "47.2184", longitude: "-1.5536" })));
  assertEquals(r.ok && [r.company.lat, r.company.lng], [null, null]);
});
Deno.test("CORS : préflight OK, origine inconnue non autorisée, GET refusé", async () => {
  const pre = await call(req(null, { method: "OPTIONS" }), fakeDeps().deps);
  assertEquals(pre.status, 204);
  assertEquals(pre.res.headers.get("Access-Control-Allow-Origin"), "https://roche-street-food.pages.dev");
  const evil = await call(req({ siret: SIRET }, { origin: "https://pirate.example" }), fakeDeps().deps);
  assertEquals(evil.res.headers.get("Access-Control-Allow-Origin"), null);
  const vercel = await call(req(null, { method: "OPTIONS", origin: "https://roche-street-food.vercel.app" }), fakeDeps().deps);
  assertEquals(vercel.res.headers.get("Access-Control-Allow-Origin"), "https://roche-street-food.vercel.app");
  const vercel2 = await call(req(null, { method: "OPTIONS", origin: "https://pwa-nantes-web.vercel.app" }), fakeDeps().deps);
  assertEquals(vercel2.res.headers.get("Access-Control-Allow-Origin"), "https://pwa-nantes-web.vercel.app");
  const vercel3 = await call(req(null, { method: "OPTIONS", origin: "https://pwa-nantes.vercel.app" }), fakeDeps().deps);
  assertEquals(vercel3.res.headers.get("Access-Control-Allow-Origin"), "https://pwa-nantes.vercel.app");
  // un autre projet Vercel au nom approchant n'est pas autorisé
  const lookalike = await call(req(null, { method: "OPTIONS", origin: "https://roche-street-food-pirate.vercel.app" }), fakeDeps().deps);
  assertEquals(lookalike.res.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals((await call(req(null, { method: "GET" }), fakeDeps().deps)).status, 405);
});
