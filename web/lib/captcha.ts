/**
 * Anti-robots Cloudflare Turnstile (même fonctionnement que sur la carte) : actif seulement si
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY est renseignée (clé de SITE, publique par nature). Chaque envoi sensible (inscription,
 * connexion, nouvel envoi de code, Google) reçoit un jeton à usage unique, vérifié par Supabase et par la fonction
 * client-signup. Le plus souvent invisible ; une case à cocher n'apparaît que si Cloudflare a un doute.
 * Préparé à l'avance (prefetchCaptcha) dès l'arrivée sur une étape : la vérification (souvent 1 à 3 s) se fait pendant
 * que la personne remplit l'écran ou choisit son compte Google, et non plus après. Jeton gardé 4 min 30 au plus
 * (Cloudflare le refuse après 5 min), une seule fois.
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
const TTL = 270_000;
let ready: { token: string; at: number } | null = null;
let inflight: Promise<void> | null = null;

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
    // Au centre de l'écran, sur un voile, seulement quand Cloudflare demande une action (rare) ; effacée dès la fin
    box.className = "fixed left-1/2 top-1/2 z-[2147483000] -translate-x-1/2 -translate-y-1/2 rounded-2xl transition-opacity duration-200 data-[open]:bg-white data-[open]:p-3 data-[open]:ring-1 data-[open]:ring-black/5 data-[open]:shadow-[0_0_0_100vmax_rgba(10,12,16,0.45)] dark:data-[open]:bg-zinc-900 dark:data-[open]:ring-white/10 data-[done]:pointer-events-none data-[done]:opacity-0";
    document.body.appendChild(box);
  }
  return box;
}

/** Nouvelle vérification (le widget précédent est retiré). */
async function solve(): Promise<string> {
  const ts = await load();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const box = slot();
    // Vérification terminée (réussie ou non) : la case s'efface tout de suite, puis le widget est retiré de la page
    // (le jeton reçu reste valable). Sans ça, la case « Réussite ! » restait affichée tout le reste de la visite.
    const end = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const id = widget;
      box.setAttribute("data-done", "");
      setTimeout(() => {
        if (widget !== id) return;   // une nouvelle vérification a déjà pris la place
        if (id !== null) { try { ts.remove(id); } catch { /* déjà retiré */ } }
        widget = null;
        box.removeAttribute("data-open");
        box.removeAttribute("data-done");
      }, 220);
      fn();
    };
    const timer = setTimeout(() => end(() => reject(new Error("captcha_timeout"))), 90_000);
    if (widget !== null) { try { ts.remove(widget); } catch { /* déjà retiré */ } }
    box.removeAttribute("data-open");
    box.removeAttribute("data-done");
    widget = ts.render(box, {
      sitekey: SITE_KEY, execution: "execute", appearance: "interaction-only", language: "fr",
      callback: (t: string) => end(() => resolve(t)),
      "error-callback": () => end(() => reject(new Error("captcha"))),
      "before-interactive-callback": () => box.setAttribute("data-open", ""),
    });
    ts.execute(widget);
  });
}

/** Prépare un jeton en arrière-plan (rien si un jeton récent attend déjà, ou si une préparation est en cours). */
export function prefetchCaptcha(): void {
  if (!captchaEnabled() || inflight || (ready && Date.now() - ready.at < TTL)) return;
  inflight = solve().then((t) => { ready = { token: t, at: Date.now() }; }, () => {}).finally(() => { inflight = null; });
}

/** Jeton à usage unique ; undefined si l'anti-robots n'est pas activé. Rejette si la vérification échoue. */
export async function captchaToken(): Promise<string | undefined> {
  if (!captchaEnabled()) return undefined;
  if (inflight) await inflight;   // préparation en cours : on l'attend, sans en relancer une
  const fresh = ready && Date.now() - ready.at < TTL ? ready.token : null;
  ready = null;
  return fresh ?? solve();
}

/** Erreur de l'anti-robots renvoyée par Supabase (jeton absent, expiré ou refusé). */
export const captchaRefused = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (/captcha/i.test(e.code ?? "") || /captcha/i.test(e.message ?? ""));
