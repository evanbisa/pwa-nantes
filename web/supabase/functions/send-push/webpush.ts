/**
 * Web Push standard, sans dépendance : chiffrement du message (RFC 8291, « aes128gcm ») et
 * identification du serveur auprès du service d'alertes du navigateur (RFC 8292, « VAPID »).
 * Uniquement WebCrypto : fonctionne tel quel dans Deno et sur Supabase Edge Functions.
 */
const enc = new TextEncoder();
/** Octets (tampon ordinaire, accepté par WebCrypto). */
export type Bytes = Uint8Array<ArrayBuffer>;

export const b64u = {
  encode(bytes: Bytes): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Bytes {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  },
};

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

export interface VapidKeys {
  publicKey: string;          // point public P-256 non compressé (65 octets), base64url
  privateJwk: JsonWebKey;     // clé privée ECDSA P-256
}

/** Nouvelle paire de clés du serveur (créée une seule fois, puis conservée par la base). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { publicKey: b64u.encode(raw), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}

/** En-tête Authorization « vapid » : jeton ES256 valable 12 h pour le service d'alertes visé. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const json = (o: unknown) => b64u.encode(enc.encode(JSON.stringify(o)));
  const unsigned = json({ typ: "JWT", alg: "ES256" }) + "." +
    json({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject });
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u.encode(sig)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/**
 * Chiffre le message pour un appareil (clés p256dh et auth fournies par son navigateur).
 * Résultat : corps de la requête, en un seul enregistrement « aes128gcm ».
 * `salt` et `serverKeys` ne sont fournis que par les tests (valeurs fixées).
 */
export async function encryptPayload(
  payload: Bytes, p256dh: string, authSecret: string,
  opts: { salt?: Bytes; serverKeys?: CryptoKeyPair } = {},
): Promise<Bytes> {
  const uaPublic = b64u.decode(p256dh);
  const auth = b64u.decode(authSecret);
  if (uaPublic.length !== 65 || auth.length !== 16) throw new Error("Clés d'abonnement invalides");
  const as = opts.serverKeys ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // un seul enregistrement : message + délimiteur 0x02 (dernier enregistrement)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}
