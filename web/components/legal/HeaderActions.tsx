"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Printer, Sun } from "lucide-react";
import { THEME_KEY } from "@/lib/legal/theme";

/** Même règle que THEME_SCRIPT, pour une arrivée par navigation interne (le script du layout n'a alors pas tourné). */
function storedTheme(): "night" | "day" {
  let t: string | null = null;
  try { t = localStorage.getItem(THEME_KEY); } catch { /* navigation privée */ }
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return t === "dark" ? "night" : "day";
}

/** Thème lu directement sur <html> (posé par le script du layout ou par le bouton), suivi à chaque changement. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const isNight = () => document.documentElement.getAttribute("data-theme") === "night";

const buttonClass =
  "grid h-10 w-10 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white";

/** Boutons de l'en-tête : imprimer le document, mode jour / nuit. */
export default function HeaderActions() {
  const night = useSyncExternalStore(subscribe, isNight, () => null);   // null : rendu sur le serveur

  useEffect(() => {
    const html = document.documentElement;
    if (!html.hasAttribute("data-theme")) html.setAttribute("data-theme", storedTheme());
    return () => html.removeAttribute("data-theme");   // le reste de l'application gère son propre thème
  }, []);

  function toggle() {
    const next = !isNight();
    document.documentElement.setAttribute("data-theme", next ? "night" : "day");
    try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { /* navigation privée */ }
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => window.print()} className={`${buttonClass} hidden sm:grid`} aria-label="Imprimer ce document" title="Imprimer">
        <Printer aria-hidden className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={toggle}
        className={buttonClass}
        aria-label={night ? "Passer en mode jour" : "Passer en mode nuit"}
        title="Mode jour / nuit"
        disabled={night === null}
      >
        {night ? <Sun aria-hidden className="h-5 w-5" /> : <Moon aria-hidden className="h-5 w-5" />}
      </button>
    </div>
  );
}
