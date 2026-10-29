// Tests de la fonction send-push, sans réseau : deno test supabase/functions/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { handle, linkFor, type Deps, type PendingNotification, type Subscription } from "./handler.ts";
import { b64u, concat, encryptPayload, generateVapidKeys, vapidAuthorization } from "./webpush.ts";
import type { Bytes } from "./webpush.ts";

/** Déchiffrement côté appareil (RFC 8291), pour vérifier ce que reçoit le navigateur. */
async function decrypt(body: Bytes, ua: CryptoKeyPair, auth: Bytes): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  assertEquals(rs, 4096);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const te = new TextEncoder();
  const hk = async (s: Bytes, ikm: Bytes, info: Bytes, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8));
  const ikm = await hk(auth, ecdh, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
  assertEquals(plain[plain.length - 1], 2, "délimiteur du dernier enregistrement");
  return new TextDecoder().decode(plain.slice(0, -1));
}
async function device() {
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64u.encode(new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)));
  return { ua, auth, p256dh, authB64: b64u.encode(auth) };
}

Deno.test("chiffrement aes128gcm : l'appareil retrouve exactement le message", async () => {
  const d = await device();
  const text = JSON.stringify({ title: "Le Bon Burger", body: "Bon plan : frites offertes 🍟" });
  const body = await encryptPayload(new TextEncoder().encode(text), d.p256dh, d.authB64);
  assertEquals(await decrypt(body, d.ua, d.auth), text);
  // deux envois du même message ne se ressemblent pas (sel et clé éphémère aléatoires)
  const again = await encryptPayload(new TextEncoder().encode(text), d.p256dh, d.authB64);
  assert(b64u.encode(again) !== b64u.encode(body));
});

Deno.test("VAPID : jeton ES256 signé, destiné au service d'alertes, valable 12 h", async () => {
  const keys = await generateVapidKeys();
  const now = Date.UTC(2026, 9, 22, 12);
  const h = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:contact@exemple.fr", now);
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert(m, h);
  const [, head, claims, sig, k] = m;
  assertEquals(k, keys.publicKey);
  assertEquals(JSON.parse(new TextDecoder().decode(b64u.decode(head))), { typ: "JWT", alg: "ES256" });
  assertEquals(JSON.parse(new TextDecoder().decode(b64u.decode(claims))), { aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:contact@exemple.fr" });
  const pub = await crypto.subtle.importKey("raw", b64u.decode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.decode(sig), new TextEncoder().encode(head + "." + claims)));
});

function fakeDeps(over: Partial<Deps> = {}, { pending = [] as PendingNotification[], subs = [] as Subscription[] } = {}) {
  const calls = { posts: [] as { url: string; init: RequestInit }[], removed: [] as string[], touched: [] as string[], saved: 0, claimed: [] as (string | null)[] };
  let stored: Awaited<ReturnType<Deps["getKeys"]>> = null;
  const deps: Deps = {
    getKeys: () => Promise.resolve(stored),
    saveKeys: (k) => { calls.saved++; if (!stored) stored = k; return Promise.resolve(); },
    claimPending: (m) => { calls.claimed.push(m); const out = pending.filter((n) => !m || n.merchant_id === m); pending = []; return Promise.resolve(out); },
    subscriptionsFor: (ids) => Promise.resolve(subs.filter((s) => ids.includes(s.user_id))),
    removeSubscription: (id) => { calls.removed.push(id); return Promise.resolve(); },
    touchSubscription: (id) => { calls.touched.push(id); return Promise.resolve(); },
    post: (url, init) => { calls.posts.push({ url, init }); return Promise.resolve({ status: url.includes("expire") ? 410 : 201 }); },
    allowEndpoint: (u) => u.startsWith("https://fcm.googleapis.com/"),
    subject: "mailto:contact@exemple.fr",
    ...over,
  };
  return { deps, calls };
}
const req = (body: unknown, method = "POST") =>
  new Request("https://x.supabase.co/functions/v1/send-push", { method, body: method === "POST" ? JSON.stringify(body) : undefined, headers: { Origin: "https://pwa-nantes.vercel.app" } });
const M = "aaaaaaaa-0000-4000-8000-000000000001";

Deno.test("clé publique : créée une seule fois, puis toujours la même", async () => {
  const { deps, calls } = fakeDeps();
  const a = await (await handle(req({ action: "key" }), deps)).json();
  const b = await (await handle(req({ action: "key" }), deps)).json();
  assertEquals(a.publicKey, b.publicKey);
  assertEquals(b64u.decode(a.publicKey).length, 65);
  assertEquals(calls.saved, 1);
});

Deno.test("envoi : chaque destinataire reçoit sa notification, chiffrée pour son appareil", async () => {
  const lea = await device(), hugo = await device();
  const pending = [
    { id: "n1", user_id: "lea", merchant_id: M, kind: "promo", title: "Le Bon Burger", body: "Bon plan : Dessert offert" },
    { id: "n2", user_id: "hugo", merchant_id: M, kind: "story", title: "Le Bon Burger", body: "A publié une story" },
  ];
  const subs = [
    { id: "s1", user_id: "lea", endpoint: "https://fcm.googleapis.com/fcm/send/lea", p256dh: lea.p256dh, auth: lea.authB64 },
    { id: "s2", user_id: "hugo", endpoint: "https://fcm.googleapis.com/fcm/send/hugo", p256dh: hugo.p256dh, auth: hugo.authB64 },
    { id: "s3", user_id: "nina", endpoint: "https://fcm.googleapis.com/fcm/send/nina", p256dh: hugo.p256dh, auth: hugo.authB64 },
  ];
  const { deps, calls } = fakeDeps({}, { pending, subs });
  const res = await handle(req({ action: "send", merchant_id: M }), deps);
  assertEquals(await res.json(), { sent: 2, failed: 0, removed: 0 });
  assertEquals(calls.claimed, [M]);
  assertEquals(calls.posts.map((p) => p.url).sort(), ["https://fcm.googleapis.com/fcm/send/hugo", "https://fcm.googleapis.com/fcm/send/lea"]);
  const toLea = calls.posts.find((p) => p.url.endsWith("/lea"))!;
  const headers = toLea.init.headers as Record<string, string>;
  assertEquals([headers["Content-Encoding"], headers.TTL], ["aes128gcm", "86400"]);
  assert(headers.Authorization.startsWith("vapid t="));
  assertEquals(JSON.parse(await decrypt(toLea.init.body as Bytes, lea.ua, lea.auth)),
    { title: "Le Bon Burger", body: "Bon plan : Dessert offert", tag: "n1", url: "./?r=" + M });
  const toHugo = calls.posts.find((p) => p.url.endsWith("/hugo"))!;
  assertEquals(JSON.parse(await decrypt(toHugo.init.body as Bytes, hugo.ua, hugo.auth)).url, "./?r=" + M + "&t=story");
  assertEquals(calls.touched.sort(), ["s1", "s2"]);
  // rien de nouveau : aucun envoi en double
  assertEquals(await (await handle(req({ action: "send", merchant_id: M }), deps)).json(), { sent: 0, failed: 0, removed: 0 });
  assertEquals(calls.posts.length, 2);
});

Deno.test("appareil désabonné (410) : oublié ; adresse hors des services d'alertes : jamais appelée", async () => {
  const d = await device();
  const pending = [{ id: "n1", user_id: "lea", merchant_id: M, kind: "reply", title: "Le Bon Burger a répondu à votre avis", body: "Merci !" }];
  const subs = [
    { id: "old", user_id: "lea", endpoint: "https://fcm.googleapis.com/fcm/send/expire", p256dh: d.p256dh, auth: d.authB64 },
    { id: "evil", user_id: "lea", endpoint: "http://169.254.169.254/latest/meta-data", p256dh: d.p256dh, auth: d.authB64 },
  ];
  const { deps, calls } = fakeDeps({}, { pending, subs });
  assertEquals(await (await handle(req({ action: "send" }), deps)).json(), { sent: 0, failed: 1, removed: 1 });
  assertEquals(calls.removed, ["old"]);
  assertEquals(calls.posts.map((p) => p.url), ["https://fcm.googleapis.com/fcm/send/expire"]);
});

Deno.test("requêtes invalides refusées ; CORS limité au site", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await handle(req({ action: "send", merchant_id: "'; drop table" }), deps)).status, 400);
  assertEquals((await handle(req({ action: "autre" }), deps)).status, 400);
  assertEquals((await handle(req(null, "GET"), deps)).status, 405);
  assertEquals(calls.claimed.length, 0);
  const res = await handle(req({ action: "key" }), deps);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://pwa-nantes.vercel.app");
  const other = await handle(new Request("https://x.supabase.co/functions/v1/send-push", { method: "POST", body: '{"action":"key"}', headers: { Origin: "https://pirate.example" } }), deps);
  assertEquals(other.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("lien de l'alerte : fiche, story ou avis", () => {
  const n = (kind: string, merchant_id: string | null = M) => ({ id: "x", user_id: "u", merchant_id, kind, title: "t", body: null });
  assertEquals(linkFor(n("promo")), "./?r=" + M);
  assertEquals(linkFor(n("review")), "./?r=" + M + "&t=reviews");
  assertEquals(linkFor(n("reply")), "./?r=" + M + "&t=reviews");
  assertEquals(linkFor(n("promo", null)), "./");
});
