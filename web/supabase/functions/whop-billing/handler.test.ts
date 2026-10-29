// Tests de la fonction whop-billing, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { WhopError } from "../_shared/whop.ts";
import { handle, type Deps, type Subscription } from "./handler.ts";

const MERCHANT = "aaaaaaaa-0000-0000-0000-000000000001";
function fakeDeps(over: Partial<Deps> = {}, sub: Subscription | null = null) {
  const calls = { whop: [] as { method: string; path: string; body?: unknown }[], saved: [] as unknown[] };
  const deps: Deps = {
    getUserId: (t) => Promise.resolve(t === "jeton-valide" ? "user-1" : null),
    getMerchant: () => Promise.resolve({ id: MERCHANT, verified: true, honor: true }),
    settings: () => Promise.resolve({ live: true, accountId: "biz_Test123456" }),
    whopPlanId: (tier, period) => Promise.resolve(`plan_${tier}${period}1234`),
    getSubscription: () => Promise.resolve(sub),
    saveSubscription: (_m, p) => { calls.saved.push(p); return Promise.resolve(); },
    whop: <T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) => {
      calls.whop.push({ method, path, body });
      if (path === "checkout_configurations") return Promise.resolve({ id: "ch_1", purchase_url: "https://whop.com/checkout/ch_1" } as T);
      const b = body as { cancel_at_period_end: boolean };
      return Promise.resolve({
        id: "mem_Abc12345", status: b.cancel_at_period_end ? "canceling" : "active", plan_id: "plan_x", cancel_at_period_end: b.cancel_at_period_end,
        current_period_end: "2026-11-26T10:00:00Z", manage_url: null, metadata: {},
      } as T);
    },
    ...over,
  };
  return { deps, calls };
}
const ACTIVE: Subscription = { mode: "whop", status: "active", whop_membership_id: "mem_Abc12345", cancel_at_period_end: false };
const CHECKOUT = { action: "checkout", plan: "premium", period: "year", return_url: "https://pwa-nantes.vercel.app/?paiement=retour" };
const call = async (body: unknown, deps: Deps, { token = "jeton-valide", origin = "https://pwa-nantes.vercel.app" } = {}) => {
  const res = await handle(new Request("https://x.supabase.co/functions/v1/whop-billing", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, Origin: origin }, body: JSON.stringify(body),
  }), deps);
  return { status: res.status, body: await res.json(), res };
};

Deno.test("paiement : page Whop de la formule choisie, restaurateur et formule en métadonnées, retour sur le site", async () => {
  const { deps, calls } = fakeDeps();
  const { status, body, res } = await call(CHECKOUT, deps);
  assertEquals([status, body], [200, { url: "https://whop.com/checkout/ch_1" }]);
  assertEquals(calls.whop, [{
    method: "POST", path: "checkout_configurations",
    body: { account_id: "biz_Test123456", plan_id: "plan_premiumyear1234", metadata: { merchant_id: MERCHANT, plan: "premium", period: "year" }, redirect_url: CHECKOUT.return_url },
  }]);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://pwa-nantes.vercel.app");
});
Deno.test("paiement : retour vers un autre site, formule inconnue ou « sur devis » refusés", async () => {
  const { deps, calls } = fakeDeps();
  for (const bad of ["https://evil.example/?x", "javascript:alert(1)", "https://pwa-nantes.vercel.app.evil.example/", 42]) {
    assertEquals((await call({ ...CHECKOUT, return_url: bad }, deps)).status, 400);
  }
  assertEquals((await call({ ...CHECKOUT, plan: "sur_devis" }, deps)).status, 400);
  assertEquals((await call({ ...CHECKOUT, period: "week" }, deps)).status, 400);
  assertEquals(calls.whop.length, 0);
});
Deno.test("paiement : non connecté, pas restaurateur, établissement non vérifié → refus", async () => {
  assertEquals((await call(CHECKOUT, fakeDeps().deps, { token: "faux" })).status, 401);
  assertEquals((await call(CHECKOUT, fakeDeps({ getMerchant: () => Promise.resolve(null) }).deps)).status, 403);
  const { status, body } = await call(CHECKOUT, fakeDeps({ getMerchant: () => Promise.resolve({ id: MERCHANT, verified: true, honor: false }) }).deps);
  assertEquals([status, body.error], [403, "incomplete"]);
});
Deno.test("paiement : déjà abonné, paiement pas encore ouvert, formule non configurée → refus sans appel à Whop", async () => {
  const already = fakeDeps({}, ACTIVE);
  assertEquals((await call(CHECKOUT, already.deps)).body.error, "already");
  const demo = fakeDeps({ settings: () => Promise.resolve({ live: false, accountId: null }) });
  assertEquals((await call(CHECKOUT, demo.deps)).body.error, "demo");
  const missing = fakeDeps({ whopPlanId: () => Promise.resolve(null) });
  assertEquals((await call(CHECKOUT, missing.deps)).status, 503);
  assertEquals(already.calls.whop.length + demo.calls.whop.length + missing.calls.whop.length, 0);
  // Ancien abonnement terminé, ou abonnement de démonstration : un paiement Whop reste possible
  assertEquals((await call(CHECKOUT, fakeDeps({}, { ...ACTIVE, status: "canceled" }).deps)).status, 200);
  assertEquals((await call(CHECKOUT, fakeDeps({}, { mode: "demo", status: "active", whop_membership_id: null, cancel_at_period_end: false }).deps)).status, 200);
});
Deno.test("résiliation : à la fin de la période payée (jamais immédiate), puis reprise possible", async () => {
  const { deps, calls } = fakeDeps({}, ACTIVE);
  const { status, body } = await call({ action: "cancel" }, deps);
  assertEquals([status, body], [200, { subscription: { status: "active", cancel_at_period_end: true, current_period_end: "2026-11-26T10:00:00.000Z" } }]);
  assertEquals(calls.whop, [{ method: "PATCH", path: "memberships/mem_Abc12345", body: { cancel_at_period_end: true } }]);
  assertEquals((calls.saved[0] as { cancel_at_period_end: boolean }).cancel_at_period_end, true);
  const resumed = await call({ action: "resume" }, fakeDeps({}, { ...ACTIVE, cancel_at_period_end: true }).deps);
  assertEquals(resumed.body.subscription.cancel_at_period_end, false);
});
Deno.test("résiliation : aucun abonnement Whop en cours → 404 ; Whop indisponible → 502", async () => {
  assertEquals((await call({ action: "cancel" }, fakeDeps().deps)).status, 404);
  assertEquals((await call({ action: "cancel" }, fakeDeps({}, { ...ACTIVE, status: "canceled" }).deps)).status, 404);
  const down = fakeDeps({ whop: () => Promise.reject(new WhopError(0, "injoignable")) }, ACTIVE);
  const { status, body } = await call({ action: "cancel" }, down.deps);
  assertEquals([status, body.error], [502, "whop"]);
  assertEquals(down.calls.saved.length, 0);
});
Deno.test("demande illisible, action inconnue, mauvaise méthode", async () => {
  const { deps } = fakeDeps();
  const bad = await handle(new Request("https://x/", { method: "POST", headers: { Authorization: "Bearer jeton-valide" }, body: "{" }), deps);
  assertEquals(bad.status, 400);
  assertEquals((await call({ action: "refund" }, deps)).status, 400);
  assertEquals((await handle(new Request("https://x/", { method: "GET" }), deps)).status, 405);
  assertEquals((await handle(new Request("https://x/", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), deps)).headers.get("Access-Control-Allow-Origin"), null);
});
