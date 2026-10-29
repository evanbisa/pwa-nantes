// Tests des outils Whop, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { signWebhook, subscriptionPatch, subscriptionStatus, verifyWebhook, type WhopMembership } from "./whop.ts";

// Signature produite par la bibliothèque officielle « standardwebhooks » avec la dérivation de clé du SDK Whop
// (@whop/sdk, helpers/verifyWebhook.mjs) : garantit que la vérification maison accepte les vraies notifications Whop.
const VECTOR = {
  secret: "ws_testsecret_0123456789abcdef",
  body: '{"id":"evt_1","type":"membership.activated","account_id":"biz_Test123456","data":{"id":"mem_Abc12345"}}',
  id: "msg_vector1",
  ts: 1793000000,
  sig: "v1,zQEpCFQK0XzqtbRDfQHT/S/5thrRrxiGVsUoDp/W+RQ=",
};
const headers = (over: Record<string, string> = {}) =>
  new Headers({ "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.ts), "webhook-signature": VECTOR.sig, ...over });
const at = (s: number) => new Date(s * 1000);

Deno.test("signature : identique à celle de la bibliothèque officielle", async () => {
  assertEquals(await signWebhook(VECTOR.secret, VECTOR.id, VECTOR.ts, VECTOR.body), VECTOR.sig);
  assertEquals(await verifyWebhook(VECTOR.secret, headers(), VECTOR.body, at(VECTOR.ts + 10)), true);
  // Plusieurs signatures (changement de secret en cours) : une seule valide suffit
  assertEquals(await verifyWebhook(VECTOR.secret, headers({ "webhook-signature": "v1,AAAA " + VECTOR.sig }), VECTOR.body, at(VECTOR.ts)), true);
});
Deno.test("signature : corps modifié, mauvais secret, autre identifiant ou en-tête manquant → refus", async () => {
  const now = at(VECTOR.ts);
  assertEquals(await verifyWebhook(VECTOR.secret, headers(), VECTOR.body.replace("activated", "deactivated"), now), false);
  assertEquals(await verifyWebhook("ws_autre_secret", headers(), VECTOR.body, now), false);
  assertEquals(await verifyWebhook(VECTOR.secret, headers({ "webhook-id": "msg_autre" }), VECTOR.body, now), false);
  assertEquals(await verifyWebhook(VECTOR.secret, headers({ "webhook-signature": "" }), VECTOR.body, now), false);
  assertEquals(await verifyWebhook(VECTOR.secret, headers({ "webhook-signature": VECTOR.sig.replace("v1,", "v2,") }), VECTOR.body, now), false);
  assertEquals(await verifyWebhook("", headers(), VECTOR.body, now), false);
});
Deno.test("signature : notification de plus de 5 minutes (ou datée du futur) refusée, rejeu impossible", async () => {
  assertEquals(await verifyWebhook(VECTOR.secret, headers(), VECTOR.body, at(VECTOR.ts + 301)), false);
  assertEquals(await verifyWebhook(VECTOR.secret, headers(), VECTOR.body, at(VECTOR.ts - 301)), false);
  assertEquals(await verifyWebhook(VECTOR.secret, headers({ "webhook-timestamp": "abc" }), VECTOR.body, at(VECTOR.ts)), false);
});

const MEMBERSHIP: WhopMembership = {
  id: "mem_Abc12345", status: "active", plan_id: "plan_PremYear1234", cancel_at_period_end: false,
  current_period_end: "2027-10-26T10:00:00Z", manage_url: "https://whop.com/billing/manage/abc", metadata: { merchant_id: "x" },
};
Deno.test("états Whop → abonnement FlashMiam", () => {
  assertEquals(["active", "trialing", "canceling", "past_due", "unresolved", "canceled", "expired", "completed", "drafted", "?"].map(subscriptionStatus),
    ["active", "active", "active", "past_due", "past_due", "canceled", "canceled", "canceled", null, null]);
  assertEquals(subscriptionPatch(MEMBERSHIP), {
    mode: "whop", status: "active", whop_membership_id: "mem_Abc12345", current_period_end: "2027-10-26T10:00:00.000Z",
    cancel_at_period_end: false, manage_url: "https://whop.com/billing/manage/abc",
  });
  assertEquals(subscriptionPatch({ ...MEMBERSHIP, status: "canceling" })!.cancel_at_period_end, true);
  assertEquals(subscriptionPatch({ ...MEMBERSHIP, status: "drafted" }), null);
  assertEquals(subscriptionPatch({ ...MEMBERSHIP, id: "mem_x' or 1=1" }), null);
  const odd = subscriptionPatch({ ...MEMBERSHIP, manage_url: "javascript:alert(1)", current_period_end: "pas une date" })!;
  assertEquals([odd.manage_url, odd.current_period_end], [null, null]);
});
