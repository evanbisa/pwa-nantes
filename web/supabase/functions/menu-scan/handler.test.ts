// Tests de la fonction menu-scan, sans réseau ni IA : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { DAILY_SCANS, handle, MAX_IMAGES, MAX_ITEMS, sanitizeItems, type Deps } from "./handler.ts";

const IMG = { mediaType: "image/jpeg", data: "/9j/4AAQSkZJRgABAQ==" };
function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { recorded: [] as number[], finished: [] as (number | null)[], extracted: 0 };
  const deps: Deps = {
    configured: true,
    getUserId: (t) => Promise.resolve(t === "jeton-valide" ? "user-1" : null),
    getMerchantId: () => Promise.resolve("merchant-1"),
    countScansSince: () => Promise.resolve(0),
    recordScan: (_m, n) => { calls.recorded.push(n); return Promise.resolve(7); },
    finishScan: (_id, n) => { calls.finished.push(n); return Promise.resolve(); },
    extract: () => {
      calls.extracted++;
      return Promise.resolve({ items: [
        { section: "Burgers", name: "Cheese burger", price: 8.5, desc: "Steak, cheddar, oignons" },
        { section: "Burgers", name: "Double   cheese", price: null, desc: "" },
      ] });
    },
    ...over,
  };
  return { deps, calls };
}
const req = (body: unknown, { token = "jeton-valide", method = "POST" } = {}) =>
  new Request("https://x.supabase.co/functions/v1/menu-scan", {
    method, headers: { Authorization: `Bearer ${token}`, Origin: "https://flashmiam.fr", "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

Deno.test("lit les photos et renvoie les plats remis en forme (prix manquant laissé vide)", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handle(req({ images: [IMG, IMG] }), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.items, [
    { section: "Burgers", name: "Cheese burger", price: 8.5, desc: "Steak, cheddar, oignons" },
    { section: "Burgers", name: "Double cheese", price: null, desc: "" },
  ]);
  assertEquals([body.missingPrices, body.truncated], [1, false]);
  assertEquals([calls.recorded, calls.finished], [[2], [2]]);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://flashmiam.fr");
});
Deno.test("refuse sans connexion, sans fiche, sans clé d'IA", async () => {
  assertEquals((await handle(req({ images: [IMG] }, { token: "faux" }), fakeDeps().deps)).status, 401);
  assertEquals((await handle(req({ images: [IMG] }), fakeDeps({ getMerchantId: () => Promise.resolve(null) }).deps)).status, 403);
  const off = fakeDeps({ configured: false });
  const res = await handle(req({ images: [IMG] }), off.deps);
  assertEquals([res.status, (await res.json()).error, off.calls.extracted], [503, "not_configured", 0]);
});
Deno.test("photos : au moins une, au plus 5, images seulement, pas trop lourdes", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await handle(req({ images: [] }), deps)).status, 400);
  assertEquals((await handle(req({ images: Array(MAX_IMAGES + 1).fill(IMG) }), deps)).status, 400);
  assertEquals((await handle(req({ images: [{ mediaType: "application/pdf", data: "JVBERi0=" }] }), deps)).status, 400);
  assertEquals((await handle(req({ images: [{ mediaType: "image/png", data: "<script>" }] }), deps)).status, 400);
  assertEquals((await handle(req({ images: [{ mediaType: "image/png", data: "A".repeat(3_000_001) }] }), deps)).status, 413);
  assertEquals((await handle(new Request("https://x/menu-scan", { method: "POST", headers: { Authorization: "Bearer jeton-valide" }, body: "{" }), deps)).status, 400);
  assertEquals(calls.extracted, 0);
});
Deno.test(`plafond : ${DAILY_SCANS} lectures par 24 heures et par fiche`, async () => {
  let since = "";
  const { deps, calls } = fakeDeps({
    countScansSince: (_m, s) => { since = s; return Promise.resolve(DAILY_SCANS); },
    now: () => new Date("2026-11-12T10:00:00Z"),
  });
  const res = await handle(req({ images: [IMG] }), deps);
  assertEquals([res.status, since, calls.extracted, calls.recorded.length], [429, "2026-11-11T10:00:00.000Z", 0, 0]);
});
Deno.test("échec, refus ou aucun plat : message clair, lecture comptée", async () => {
  let r = fakeDeps({ extract: () => Promise.reject(new Error("panne")) });
  assertEquals([(await handle(req({ images: [IMG] }), r.deps)).status, r.calls.finished], [502, [null]]);
  r = fakeDeps({ extract: () => Promise.resolve({ items: [], refused: true }) });
  assertEquals((await handle(req({ images: [IMG] }), r.deps)).status, 422);
  r = fakeDeps({ extract: () => Promise.resolve({ items: [] }) });
  const res = await handle(req({ images: [IMG] }), r.deps);
  assertEquals([res.status, (await res.json()).error, r.calls.finished], [422, "empty", [0]]);
});
Deno.test("OPTIONS (CORS) et méthode non autorisée", async () => {
  const { deps } = fakeDeps();
  assertEquals((await handle(req(null, { method: "OPTIONS" }), deps)).status, 204);
  assertEquals((await handle(req(null, { method: "GET" }), deps)).status, 405);
});
Deno.test("remise en forme : longueurs et prix de la base, éléments invalides écartés", () => {
  const items = sanitizeItems([
    { section: "S".repeat(40), name: "  Tacos   XL ", price: "12,90 €", desc: "D".repeat(200) },
    { name: "X", price: 3 },                          // nom trop court
    { name: "Pizza géante", price: 1200 },             // prix hors limites : à compléter
    { name: "Frites", price: 3.456 },
    null, "texte", 42,
  ]);
  assertEquals(items, [
    { section: "S".repeat(30), name: "Tacos XL", price: 12.9, desc: "D".repeat(120) },
    { section: "", name: "Pizza géante", price: null, desc: "" },
    { section: "", name: "Frites", price: 3.46, desc: "" },
  ]);
  assertEquals(sanitizeItems("pas une liste"), []);
  assertEquals(sanitizeItems(Array(100).fill({ name: "Kebab", price: 7 })).length, MAX_ITEMS);
});
