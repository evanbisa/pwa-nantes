"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * « S'inscrire avec Google » : notre bouton encadré (logo officiel) est toujours visible ; le bouton de Google est posé
 * dessus, invisible, pour que le toucher ouvre la vraie connexion Google. Le script de Google n'est chargé qu'avec
 * l'accord de la personne (même choix que le bandeau des cookies de la carte) ; toucher le bouton vaut accord.
 */

type Gsi = {
  initialize(o: Record<string, unknown>): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  prompt(cb?: (n: { isNotDisplayed?: () => boolean; isSkippedMoment?: () => boolean }) => void): void;
};
declare global {
  interface Window { google?: { accounts?: { id?: Gsi } } }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CONSENT_KEY = "flashmiam:consent";
const CONSENT_MAX_AGE = 182 * 864e5;   // comme la carte : choix redemandé au bout de 6 mois

type Choice = { v: 1; stats: boolean; google: boolean; at: string };
function readConsent(): Choice | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null");
    return c && c.v === 1 && Date.now() - new Date(c.at).getTime() < CONSENT_MAX_AGE ? c : null;
  } catch { return null; }
}
/** Accord donné en touchant le bouton : Google accepté, le choix des statistiques reste le précédent (refusé sinon). */
function allowGoogle() {
  const prev = readConsent();
  const next: Choice = { v: 1, stats: prev?.stats ?? false, google: true, at: new Date().toISOString() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(next)); } catch { /* gardé le temps de la visite */ }
}

let loading: Promise<Gsi> | null = null;
function loadGsi(): Promise<Gsi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  return loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("gsi")));
    s.onerror = () => { loading = null; reject(new Error("gsi")); };
    document.head.appendChild(s);
  });
}

/** Accord Google déjà donné sur cet appareil (rendu sur le serveur : supposé donné, pour n'afficher aucune mention). */
const noSubscribe = () => () => {};
const useGoogleConsent = () => useSyncExternalStore(noSubscribe, () => readConsent()?.google ?? false, () => true);

export default function GoogleSignup({ onCredential }: { onCredential: (credential: string) => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [mounted, setMounted] = useState(false);
  const [granted, setGranted] = useState(false);   // accord donné en touchant le bouton
  const [note, setNote] = useState("");
  const consented = useGoogleConsent();
  const needsConsent = !consented && !granted;

  useEffect(() => { callback.current = onCredential; }, [onCredential]);

  const UNAVAILABLE = "Connexion Google indisponible pour le moment. Inscrivez-vous avec votre adresse e-mail, ou réessayez plus tard.";
  /** Pose le vrai bouton de Google sur le nôtre. */
  function install(gsi: Gsi) {
    gsi.initialize({
      client_id: CLIENT_ID, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_button: true,
      callback: (r: { credential?: string }) => { if (r.credential) callback.current(r.credential); },
    });
    if (!slot.current) return;
    slot.current.textContent = "";
    gsi.renderButton(slot.current, {
      type: "standard", size: "large", shape: "pill", logo_alignment: "center", locale: "fr", text: "signup_with",
      theme: document.documentElement.getAttribute("data-theme") === "night" ? "filled_black" : "outline",
      width: Math.min(400, Math.max(240, box.current?.offsetWidth ?? 320)),
    });
    setMounted(true);
  }

  // Accord déjà donné : le vrai bouton de Google est posé dès l'arrivée sur l'écran
  useEffect(() => {
    if (!CLIENT_ID || !consented) return;
    let alive = true;
    loadGsi().then((gsi) => { if (alive) install(gsi); }, () => { if (alive) setNote(UNAVAILABLE); });
    return () => { alive = false; };
  }, [consented]);

  /* Toucher notre bouton (accord pas encore donné, bouton de Google pas encore chargé, ou bord du bouton) */
  async function click() {
    if (needsConsent) { allowGoogle(); setGranted(true); }
    setNote("Ouverture de Google…");
    const gsi = await loadGsi().catch(() => null);
    if (!gsi) return setNote(UNAVAILABLE);
    install(gsi);
    setNote("");
    try {
      gsi.prompt((n) => {
        if (n?.isNotDisplayed?.() || n?.isSkippedMoment?.()) setNote("Touchez encore « S'inscrire avec Google » pour continuer.");
      });
    } catch { setNote("Touchez encore « S'inscrire avec Google » pour continuer."); }
  }

  if (!CLIENT_ID) return null;
  return (
    <div className="mt-5 grid gap-3">
      <p className="flex items-center gap-3 text-sm text-slate-500 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200 dark:text-zinc-400 dark:before:bg-white/10 dark:after:bg-white/10">ou</p>
      <div className="group relative">
        <button
          ref={box} id="su-google-btn" type="button" onClick={click} tabIndex={mounted ? -1 : 0} aria-hidden={mounted || undefined}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full border-[1.5px] border-slate-300 bg-white text-[15.5px] font-medium text-slate-900 shadow-sm transition group-focus-within:ring-2 group-focus-within:ring-brand group-focus-within:ring-offset-2 [@media(hover:hover)]:group-hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:backdrop-blur-xl dark:ring-offset-night dark:group-focus-within:ring-brand-night [@media(hover:hover)]:dark:group-hover:bg-white/[0.08]"
        >
          <svg viewBox="0 0 48 48" aria-hidden className="h-[22px] w-[22px]">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          S&apos;inscrire avec Google
        </button>
        <div ref={slot} id="su-google" className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-full opacity-[0.01] ${mounted ? "" : "hidden"}`} />
      </div>
      {(needsConsent || note) && (
        <p id="su-google-note" aria-live="polite" className="text-center text-[13px] leading-relaxed text-slate-500 dark:text-zinc-400">
          {note || "En touchant ce bouton, vous autorisez les services Google (cookies de Google)."}
        </p>
      )}
      {/* Le compte peut être créé ici, sans passer par l'écran du mot de passe : mêmes conditions à accepter */}
      <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
        Avec Google, vous acceptez les{" "}
        <a className="underline" href={`${BASE}/legal/cgu/`}>conditions d&apos;utilisation</a> et la{" "}
        <a className="underline" href={`${BASE}/legal/confidentialite/`}>politique de confidentialité</a>.
      </p>
    </div>
  );
}
