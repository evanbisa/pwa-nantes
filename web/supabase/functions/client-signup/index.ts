/**
 * Edge Function « client-signup » (Supabase) : inscription d'un client sans code par e-mail.
 * Appel depuis le site : supabase.functions.invoke("client-signup", { body: { action, … } })
 * La clé secrète est fournie par Supabase (SUPABASE_SECRET_KEYS) : elle n'est écrite nulle part.
 * verify_jwt = false : appelée par des visiteurs sans compte ; tout est vérifié ici.
 * Domaine de l'adresse vérifié par DNS sur HTTPS (seul le domaine, ex. « gmail.com », est transmis) ;
 * MAIL_DNS_URL permet d'utiliser un autre service (copie locale de test).
 * Anti-robots : TURNSTILE_SECRET_KEY (Supabase › Edge Functions › Secrets) ; absente = contrôle désactivé.
 * TURNSTILE_VERIFY_URL permet d'utiliser une copie locale du service de vérification (tests).
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
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
const TURNSTILE_VERIFY = Deno.env.get("TURNSTILE_VERIFY_URL") ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Réglages lus dans la base, gardés une minute (évite une lecture à chaque appel). */
let settingsCache: { at: number; value: { confirmEmail: boolean } } | null = null;
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
  async createUser({ email, password, metadata, confirmed }) {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed, user_metadata: metadata });
    if (!error) return "created";
    if (error.code === "email_exists" || /already been registered|already registered/i.test(error.message)) return "exists";
    if (error.code === "weak_password") return "weak";
    throw error;
  },
  async settings() {
    if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache.value;
    const { data, error } = await admin.from("app_settings").select("client_email_confirmation").maybeSingle();
    if (error) throw error;
    const value = { confirmEmail: data?.client_email_confirmation === true };
    settingsCache = { at: Date.now(), value };
    return value;
  },
  async sendCode(email) {
    // Avec la clé secrète : Supabase n'exige pas d'anti-robots (le jeton du visiteur a déjà été vérifié ici) et
    // n'envoie le code (modèle « Confirm signup ») qu'à une adresse qui attend encore sa confirmation.
    const { error } = await admin.auth.resend({ type: "signup", email });
    if (error) throw error;
  },
  verifyCaptcha(token, ip) {
    if (!TURNSTILE_SECRET) return null;
    return (async () => {
      try {
        const res = await fetch(TURNSTILE_VERIFY, {
          method: "POST",
          body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
          signal: AbortSignal.timeout(5000),
        });
        const j = res.ok ? await res.json() : null;
        return j?.success === true;
      } catch {
        return false;   // service injoignable : refus (prudence), la personne peut réessayer
      }
    })();
  },
  now: () => new Date(),
};

Deno.serve((req) => handle(req, deps));
