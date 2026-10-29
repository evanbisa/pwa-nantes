/**
 * Edge Function « client-signup » (Supabase) : inscription d'un client sans code par e-mail.
 * Appel depuis le site : supabase.functions.invoke("client-signup", { body: { action, … } })
 * La clé secrète est fournie par Supabase (SUPABASE_SECRET_KEYS) : elle n'est écrite nulle part.
 * verify_jwt = false : appelée par des visiteurs sans compte ; tout est vérifié ici.
 * Domaine de l'adresse vérifié par DNS sur HTTPS (seul le domaine, ex. « gmail.com », est transmis) ;
 * MAIL_DNS_URL permet d'utiliser un autre service (copie locale de test).
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handle, mailVerdict, type Deps } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default as string;
  } catch { /* ancien format */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
})();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const DNS_URL = Deno.env.get("MAIL_DNS_URL") ?? "https://cloudflare-dns.com/dns-query";
const hmacKey = crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

async function dns(name: string, type: "MX" | "A") {
  try {
    const res = await fetch(`${DNS_URL}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(2500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const deps: Deps = {
  async mailDomain(domain) {
    const mx = await dns(domain, "MX");
    const needA = mx && mx.Status === 0 && !(mx.Answer ?? []).some((r: { type: number }) => r.type === 15);
    return mailVerdict(mx, needA ? await dns(domain, "A") : null);
  },
  async attempt(ipHash, kind) {
    const { data, error } = await admin.rpc("signup_attempt", { p_ip_hash: ipHash, p_kind: kind });
    if (error) throw error;
    return data === true;
  },
  async hashIp(ip) {
    const sig = await crypto.subtle.sign("HMAC", await hmacKey, new TextEncoder().encode(ip));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  },
  async createUser({ email, password, metadata }) {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
    if (!error) return "created";
    if (error.code === "email_exists" || /already been registered|already registered/i.test(error.message)) return "exists";
    if (error.code === "weak_password") return "weak";
    throw error;
  },
  now: () => new Date(),
};

Deno.serve((req) => handle(req, deps));
