// Tests de la fonction whop-webhook, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { paymentRow, signWebhook, WhopError, type WhopMembership, type WhopPayment } from "../_shared/whop.ts";
import { handle, type Deps, type StoredSubscription } from "./handler.ts";

const SECRET = "ws_secret_de_test_123";
const NOW = new Date("2026-10-26T12:00:00Z");
const MERCHANT = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "aaaaaaaa-0000-0000-0000-000000000002";
const MEMBERSHIP: WhopMembership = {
  id: "mem_Abc12345", status: "active", plan_id: "plan_PremYear1234", cancel_at_period_end: false,
  current_period_end: "2027-10-26T12:00:00Z", manage_url: "https://whop.com/billing/manage/abc", metadata: { merchant_id: MERCHANT },
};

const PAYMENT: WhopPayment = {
  id: "pay_Xyz98765", status: "paid", total: 790, currency: "EUR", paid_at: "2026-10-26T11:59:00Z", refunded_amount: 0,
  billing_reason: "subscription_create", membership: { id: "mem_Abc12345" }, plan: { id: "plan_PremYear1234" },
};

function fakeDeps(over: Partial<Deps> = {}, { membership = MEMBERSHIP, subs = [] as StoredSubscription[], payment = PAYMENT } = {}) {
  const calls = { saved: [] as { merchantId: string; row: Record<string, unknown> }[], remembered: [] as string[], fetched: [] as string[],
    payments: [] as Record<string, unknown>[] };
  const seen = new Set<string>();
  const deps: Deps = {
    secret: SECRET,
    accountId: () => Promise.resolve("biz_Test123456"),
    seen: (id) => Promise.resolve(seen.has(id)),
    remember: (id, type) => { seen.add(id); calls.remembered.push(`${id}:${type}`); return Promise.resolve(); },
    getMembership: (id) => { calls.fetched.push(id); return Promise.resolve(membership); },
    planFor: (p) => Promise.resolve(p === "plan_PremYear1234" ? { tier: "premium", period: "year" } : null),
    merchantExists: (id) => Promise.resolve(id === MERCHANT || id === OTHER),
    subscriptionOf: (m) => Promise.resolve(subs.find((s) => s.merchant_id === m) ?? null),
    subscriptionByMembership: (id) => Promise.resolve(subs.find((s) => s.whop_membership_id === id) ?? null),
    save: (merchantId, row) => {
      calls.saved.push({ merchantId, row: { ...row } });
      if (!subs.some((s) => s.whop_membership_id === row.whop_membership_id)) subs.push({ merchant_id: merchantId, mode: "whop", status: row.status, whop_membership_id: row.whop_membership_id });
      return Promise.resolve();
    },
    getPayment: (id) => { calls.fetched.push(id); return Promise.resolve(payment); },
    savePayment: (row) => { calls.payments.push({ ...row }); return Promise.resolve(); },
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}
let n = 0;
async function notify(deps: Deps, event: Record<string, unknown>, { id = `msg_${++n}`, secret = SECRET, ts = Math.floor(NOW.getTime() / 1000) } = {}) {
  const body = JSON.stringify({ api_version: "v1", account_id: "biz_Test123456", timestamp: NOW.toISOString(), ...event });
  const res = await handle(new Request("https://x.supabase.co/functions/v1/whop-webhook", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": await signWebhook(secret, id, ts, body), "Content-Type": "application/json" },
    body,
  }), deps);
  return { status: res.status, body: await res.json() };
}
const activated = { type: "membership.activated", data: { id: "mem_Abc12345", status: "active" } };

Deno.test("paiement confirmé : abonnement relu chez Whop puis enregistré pour le restaurateur (formule d'après le tarif)", async () => {
  const { deps, calls } = fakeDeps();
  const { status, body } = await notify(deps, activated);
  assertEquals([status, body], [200, { updated: true, status: "active" }]);
  assertEquals(calls.fetched, ["mem_Abc12345"]);
  assertEquals(calls.saved, [{ merchantId: MERCHANT, row: {
    mode: "whop", status: "active", whop_membership_id: "mem_Abc12345", current_period_end: "2027-10-26T12:00:00.000Z",
    cancel_at_period_end: false, manage_url: "https://whop.com/billing/manage/abc", plan: "premium", period: "year",
  } }]);
});
Deno.test("signature fausse, secret différent ou notification trop ancienne : refus, rien n'est lu ni enregistré", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await notify(deps, activated, { secret: "ws_pirate" })).status, 401);
  assertEquals((await notify(deps, activated, { ts: Math.floor(NOW.getTime() / 1000) - 600 })).status, 401);
  const forged = await handle(new Request("https://x/", { method: "POST", body: JSON.stringify(activated) }), deps);
  assertEquals(forged.status, 401);
  assertEquals([calls.fetched.length, calls.saved.length], [0, 0]);
});
Deno.test("notification déjà traitée : ignorée", async () => {
  const { deps, calls } = fakeDeps();
  await notify(deps, activated, { id: "msg_double" });
  const again = await notify(deps, activated, { id: "msg_double" });
  assertEquals(again.body, { duplicate: true });
  assertEquals(calls.saved.length, 1);
});
Deno.test("contenu de la notification jamais cru : c'est l'état relu chez Whop qui compte", async () => {
  // La notification dit « active », mais Whop répond que l'abonnement est terminé
  const { deps, calls } = fakeDeps({}, { membership: { ...MEMBERSHIP, status: "expired" } });
  await notify(deps, activated);
  assertEquals(calls.saved[0].row.status, "canceled");
});
Deno.test("paiement refusé, résiliation programmée, fin d'abonnement", async () => {
  for (const [whop, status, cancel] of [["past_due", "past_due", false], ["canceling", "active", true], ["canceled", "canceled", false]] as const) {
    const { deps, calls } = fakeDeps({}, { membership: { ...MEMBERSHIP, status: whop }, subs: [{ merchant_id: MERCHANT, mode: "whop", status: "active", whop_membership_id: "mem_Abc12345" }] });
    await notify(deps, { type: "membership.updated", data: { id: "mem_Abc12345" } });
    assertEquals([calls.saved[0].row.status, calls.saved[0].row.cancel_at_period_end], [status, cancel]);
  }
});
Deno.test("paiement (payment.*) : l'abonnement concerné est resynchronisé ; autres notifications ignorées", async () => {
  const { deps, calls } = fakeDeps({}, { payment: { ...PAYMENT, id: "pay_Fail0001", status: "failed", paid_at: null } });
  const { body } = await notify(deps, { type: "payment.failed", data: { id: "pay_Fail0001", membership_id: "mem_Abc12345" } });
  assertEquals(calls.fetched, ["mem_Abc12345", "pay_Fail0001"]);
  assertEquals([body.payment, calls.payments.length], ["not_paid", 0]);
  const other = await notify(deps, { type: "refund.created", data: { id: "rfd_1" } });
  assertEquals(other.body, { ignored: "type" });
});
Deno.test("restaurateur déjà relié à l'abonnement prioritaire sur les métadonnées", async () => {
  const { deps, calls } = fakeDeps({}, { membership: { ...MEMBERSHIP, metadata: { merchant_id: OTHER } }, subs: [{ merchant_id: MERCHANT, mode: "whop", status: "active", whop_membership_id: "mem_Abc12345" }] });
  await notify(deps, activated);
  assertEquals(calls.saved[0].merchantId, MERCHANT);
});
Deno.test("fin d'un ancien abonnement : ne coupe pas le nouvel abonnement du même restaurateur", async () => {
  const { deps, calls } = fakeDeps({}, { membership: { ...MEMBERSHIP, status: "expired" }, subs: [{ merchant_id: MERCHANT, mode: "whop", status: "active", whop_membership_id: "mem_Nouveau999" }] });
  const { body } = await notify(deps, { type: "membership.deactivated", data: { id: "mem_Abc12345" } });
  assertEquals(body, { ignored: "superseded" });
  assertEquals(calls.saved.length, 0);
});
Deno.test("tarif inconnu, restaurateur introuvable, autre compte Whop : ignorés sans erreur", async () => {
  const unknownPlan = fakeDeps({}, { membership: { ...MEMBERSHIP, plan_id: "plan_Autre12345" } });
  assertEquals((await notify(unknownPlan.deps, activated)).body, { ignored: "plan" });
  const noMerchant = fakeDeps({}, { membership: { ...MEMBERSHIP, metadata: { merchant_id: "bbbbbbbb-0000-0000-0000-000000000009" } } });
  assertEquals((await notify(noMerchant.deps, activated)).body, { ignored: "merchant" });
  const badMeta = fakeDeps({}, { membership: { ...MEMBERSHIP, metadata: { merchant_id: "'; drop table merchants;--" } } });
  assertEquals((await notify(badMeta.deps, activated)).body, { ignored: "merchant" });
  const otherAccount = fakeDeps();
  assertEquals((await notify(otherAccount.deps, { ...activated, account_id: "biz_Autre12345" })).body, { ignored: "account" });
  assertEquals(unknownPlan.calls.saved.length + noMerchant.calls.saved.length + badMeta.calls.saved.length + otherAccount.calls.saved.length, 0);
});
Deno.test("Whop ou la base indisponibles : erreur, la notification sera renvoyée par Whop (et non marquée traitée)", async () => {
  const down = fakeDeps({ getMembership: () => Promise.reject(new WhopError(503, "indisponible")) });
  assertEquals((await notify(down.deps, activated)).status, 502);
  assertEquals(down.calls.remembered.length, 0);
  const gone = fakeDeps({ getMembership: () => Promise.reject(new WhopError(404, "introuvable")) });
  assertEquals((await notify(gone.deps, activated)).status, 200);
  const db = fakeDeps({ save: () => Promise.reject(new Error("base")) });
  assertEquals((await notify(db.deps, activated)).status, 500);
});
Deno.test("secret absent : 503 (rien n'est accepté sans signature)", async () => {
  const { deps } = fakeDeps({ secret: "" });
  assertEquals((await notify(deps, activated)).status, 503);
  assertEquals((await handle(new Request("https://x/", { method: "GET" }), deps)).status, 405);
});

Deno.test("paiement encaissé : relu chez Whop puis enregistré (montant en centimes, restaurant et formule déduits)", async () => {
  const { deps, calls } = fakeDeps();
  const { status, body } = await notify(deps, { type: "payment.succeeded", data: { id: "pay_Xyz98765", membership_id: "mem_Abc12345", total: 1 } });
  assertEquals([status, body.payment], [200, "saved"]);
  assertEquals(calls.payments, [{
    id: "pay_Xyz98765", membership_id: "mem_Abc12345", amount_cents: 79000, refunded_cents: 0, currency: "eur",
    paid_at: "2026-10-26T11:59:00.000Z", billing_reason: "subscription_create", merchant_id: MERCHANT, plan: "premium", period: "year",
  }]);
});
Deno.test("remboursement (refund.*) : le paiement est relu et mis à jour (montant remboursé)", async () => {
  const { deps, calls } = fakeDeps({}, { payment: { ...PAYMENT, refunded_amount: "790.00" } });
  const { body } = await notify(deps, { type: "refund.created", data: { id: "rfd_1", payment_id: "pay_Xyz98765" } });
  assertEquals(body, { payment: "saved" });
  assertEquals(calls.payments[0].refunded_cents, 79000);
});
Deno.test("paiement introuvable chez Whop : ignoré ; Whop indisponible : notification renvoyée", async () => {
  const gone = fakeDeps({ getPayment: () => Promise.reject(new WhopError(404, "introuvable")) });
  assertEquals((await notify(gone.deps, { type: "payment.succeeded", data: { id: "pay_Xyz98765" } })).body, { payment: "missing" });
  const down = fakeDeps({ getPayment: () => Promise.reject(new WhopError(503, "indisponible")) });
  assertEquals((await notify(down.deps, { type: "payment.succeeded", data: { id: "pay_Xyz98765" } })).status, 502);
  assertEquals(down.calls.remembered.length, 0);
});
Deno.test("lecture d'un paiement Whop : montants, dates et identifiants vérifiés", () => {
  assertEquals(paymentRow({ ...PAYMENT, total: "29.9", paid_at: 1761480000, membership: null, membership_id: "mem_Abc12345", plan: null, plan_id: "x" })?.amount_cents, 2990);
  assertEquals(paymentRow({ ...PAYMENT, paid_at: 1761480000 })?.paid_at, "2025-10-26T12:00:00.000Z");
  assertEquals(paymentRow({ ...PAYMENT, total: -5 }), null);
  assertEquals(paymentRow({ ...PAYMENT, status: "open" }), null);
  assertEquals(paymentRow({ ...PAYMENT, id: "pay_'; drop" }), null);
  assertEquals(paymentRow({ ...PAYMENT, refunded_amount: 9999 })?.refunded_cents, 79000);
  assertEquals(paymentRow({ ...PAYMENT, membership: { id: "pirate" } })?.membership_id, null);
});
