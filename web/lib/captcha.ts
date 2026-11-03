/**
 * Anti-robots Cloudflare Turnstile (même fonctionnement que sur la carte) : actif seulement si
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY est renseignée (clé de SITE, publique par nature). Chaque envoi sensible (inscription,
 * connexion, nouvel envoi de code, Google) reçoit un jeton à usage unique, vérifié par Supabase et par la fonction
 * client-signup. Le plus souvent invisible ; une case à cocher n'apparaît que si Cloudflare a un doute.
 */
type Turnstile = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  remove(widgetId: string): void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const API = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const CAPTCHA_FAILED = "La vérification anti-robots n'a pas abouti. Vérifiez votre connexion puis réessayez.";

let loading: Promise<Turnstile> | null = null;
let widget: string | null = null;

export const captchaEnabled = () => SITE_KEY !== "";

function load(): Promise<Turnstile> {
  if (!loading) {
    loading = new Promise<Turnstile>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = API;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
      s.onerror = () => { loading = null; reject(new Error("turnstile")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

function slot(): HTMLElement {
  let box = document.getElementById("captcha-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "captcha-box";
    box.className = "fixed bottom-6 left-1/2 z-[2147483000] -translate-x-1/2 rounded-2xl data-[open]:bg-white data-[open]:p-3 data-[open]:shadow-2xl dark:data-[open]:bg-zinc-900";
    document.body.appendChild(box);
  }
  return box;
}

/** Jeton à usage unique ; undefined si l'anti-robots n'est pas activé. Rejette si la vérification échoue. */
export async function captchaToken(): Promise<string | undefined> {
  if (!captchaEnabled()) return undefined;
  const ts = await load();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const box = slot();
    const end = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); box.removeAttribute("data-open"); fn(); } };
    const timer = setTimeout(() => end(() => reject(new Error("captcha_timeout"))), 90_000);
    if (widget !== null) { try { ts.remove(widget); } catch { /* déjà retiré */ } }
    widget = ts.render(box, {
      sitekey: SITE_KEY, execution: "execute", appearance: "interaction-only", language: "fr",
      callback: (t: string) => end(() => resolve(t)),
      "error-callback": () => end(() => reject(new Error("captcha"))),
      "before-interactive-callback": () => box.setAttribute("data-open", ""),
    });
    ts.execute(widget);
  });
}

/** Erreur de l'anti-robots renvoyée par Supabase (jeton absent, expiré ou refusé). */
export const captchaRefused = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (/captcha/i.test(e.code ?? "") || /captcha/i.test(e.message ?? ""));
