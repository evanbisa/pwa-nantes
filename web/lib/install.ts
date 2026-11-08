/**
 * FlashMiam sur l'écran d'accueil, proposé pendant l'inscription.
 *
 * Aucun navigateur ne laisse un site s'installer tout seul : l'utilisateur confirme toujours lui-même.
 *  - Android (Chrome, Edge, Samsung Internet) : le navigateur envoie « beforeinstallprompt » quand le site peut être
 *    installé ; il est gardé ici, puis sa fenêtre « Installer l'application » est ouverte au clic sur « Créer mon compte »
 *    (elle doit l'être pendant un geste de l'utilisateur, d'où l'appel immédiat, sans attente).
 *  - iPhone / iPad (Safari) : aucune fenêtre possible ; la carte montre le guide « Partager › Sur l'écran d'accueil ».
 * La carte (index.html) lit le même stockage : une installation acceptée ici n'y est plus proposée.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallResult = "accepted" | "dismissed" | "unavailable";

/** Stockage de la carte (index.html, module Install) : { done, doneAt }. */
const INSTALL_KEY = "roche-street-food:install";

let deferred: InstallPrompt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();   // pas de bandeau du navigateur au hasard : proposé au clic sur « Créer mon compte »
    deferred = ev as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => { deferred = null; markInstalled(); });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isMobile = () => {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

function alreadyInstalled() {
  try { return !!JSON.parse(localStorage.getItem(INSTALL_KEY) ?? "{}").done; } catch { return false; }
}

function markInstalled() {
  try {
    const saved = JSON.parse(localStorage.getItem(INSTALL_KEY) ?? "{}");
    localStorage.setItem(INSTALL_KEY, JSON.stringify({ ...saved, done: true, doneAt: new Date().toISOString() }));
  } catch { /* stockage indisponible : la carte le reproposera */ }
}

/** La case « Ajouter FlashMiam à mon écran d'accueil » a-t-elle un sens ici ? (téléphone, pas déjà installé) */
export const canAddToHome = () => isMobile() && !isStandalone() && !alreadyInstalled();

/**
 * Ouvre la fenêtre d'installation du navigateur, s'il en a proposé une. À appeler PENDANT le clic (sans await avant).
 * « unavailable » : pas de fenêtre possible ici (iPhone, navigateur intégré à une appli, refus du navigateur).
 */
export function promptInstall(): Promise<InstallResult> {
  const prompt = deferred;
  if (!prompt) return Promise.resolve("unavailable");
  deferred = null;   // une proposition du navigateur ne sert qu'une fois
  return prompt.prompt()
    .then(() => prompt.userChoice)
    .then(({ outcome }) => {
      if (outcome === "accepted") markInstalled();
      return outcome;
    })
    .catch((): InstallResult => "unavailable");
}
