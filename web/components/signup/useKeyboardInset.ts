"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Champs qui ouvrent le clavier à l'écran (pas les cases à cocher, curseurs, boutons…). */
const TEXT_ENTRY = [
  "textarea", "[contenteditable='']", "[contenteditable='true']", "input:not([type])",
  ...["text", "email", "password", "search", "tel", "url", "number"].map((t) => `input[type=${t}]`),
].join(",");

function isTextEntry(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.matches(TEXT_ENTRY)) return false;
  return !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || (!el.readOnly && !el.disabled);
}

/** Hauteur du clavier déjà vue pendant la visite, par orientation : les ouvertures suivantes partent avec lui. */
const known = { portrait: 0, landscape: 0 };
const orientation = () => (window.innerWidth > window.innerHeight ? "landscape" : "portrait");

/** Glissement du contenu : durée et courbe des animations d'iOS (le clavier met ~0,15 à 0,2 s). */
const SLIDE = { duration: 250, easing: "cubic-bezier(.32, .72, 0, 1)" };

/**
 * Clavier des téléphones : sur iPhone et Chrome Android, la page garde sa taille et seule la partie visible
 * (window.visualViewport) rétrécit. Réserve en bas de `target` (le contenu de l'étape) la hauteur cachée par le
 * clavier, pour que le champ et « Continuer » restent au-dessus. Navigateurs où la page rétrécit d'elle-même
 * (Firefox Android) : la mesure donne 0, il n'y a rien à faire.
 *
 * Suivre le clavier sans retard (vidéo sur iPhone du 27/11/2026) : Safari ne prévient (« resize ») qu'au tout début
 * de l'ouverture, et seulement ~0,4 s APRÈS la fin de la fermeture. On ne l'attend donc pas :
 * - fermeture : dès que le champ perd le focus (le clavier part au même moment) ;
 * - ouverture : dès que le doigt pose le focus sur un champ, si la hauteur du clavier est déjà connue ; sinon au
 *   premier « resize », qui arrive avec le début de l'animation du clavier ;
 * - changement d'étape : le champ qui avait le focus disparaît sans prévenir ; si la nouvelle étape n'en a pas, le
 *   clavier se ferme, on le suit tout de suite (paramètre `step`).
 * Le décalage de la vue (visualViewport.offsetTop) n'entre pas dans le calcul : il bouge quand Safari fait glisser
 * la page, et le suivre faisait sauter le contenu plusieurs fois à l'ouverture.
 *
 * Fluidité (skills apple-design et animation-performance) : la nouvelle mise en page est posée d'un coup, puis chaque
 * bloc de l'étape (titre et champ, bouton, Google…) glisse de son ancienne place à la nouvelle par `transform`
 * (technique FLIP) : animé par la carte graphique, sur la durée et la courbe d'iOS, sans recalcul de mise en page à
 * chaque image. « Réduire les animations » : la place est réservée sans glissement.
 */
export function useKeyboardInset(target: RefObject<HTMLElement | null>, step?: unknown): void {
  const stepChanged = useRef<() => void>(() => {});
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let current = 0;
    let frame = 0;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let touched: { el: EventTarget | null; at: number } = { el: null, at: -Infinity };

    /** Réserve `h` px en bas du contenu, et fait glisser les blocs de l'étape vers leur nouvelle place. */
    const apply = (h: number) => {
      const el = target.current;
      if (h === current || !el) return;
      current = h;
      const blocks = reduce.matches ? [] : Array.from(el.querySelectorAll<HTMLElement>(":scope > * > * > *"));
      const before = blocks.map((b) => b.getBoundingClientRect().top);   // place affichée, glissement en cours compris
      blocks.forEach((b) => b.getAnimations().forEach((a) => { if (a.id === "kb") a.cancel(); }));
      el.style.paddingBottom = h ? `calc(1.5rem + ${h}px - max(12px, env(safe-area-inset-bottom)))` : "";
      blocks.forEach((b, i) => {
        const dy = before[i] - b.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        b.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { ...SLIDE, id: "kb" });
      });
    };

    /** Hauteur cachée par le clavier, 0 s'il est fermé, -1 si la page est zoomée (mesure faussée). */
    const measure = () => {
      if (vv.scale > 1.05) return -1;
      const covered = Math.round(window.innerHeight - vv.height);
      return covered > 120 ? covered : 0;
    };
    const onResize = () => {
      const h = measure();
      if (h < 0) return;
      if (h > 0) {
        known[orientation()] = h;
        if (isTextEntry(document.activeElement)) apply(h);   // pas de champ actif : clavier en train de partir
      } else {
        apply(0);   // filet : clavier fermé sans perte de focus (touche « masquer » de l'iPad…)
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") touched = { el: e.target, at: e.timeStamp };
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!isTextEntry(e.target)) return;
      const now = measure();
      if (now > 0) { apply(now); return; }   // clavier déjà ouvert (on passe d'un champ à l'autre)
      const h = known[orientation()];
      const byFinger = touched.el === e.target && e.timeStamp - touched.at < 1000;
      if (!h || !byFinger) return;   // hauteur inconnue, ou focus posé par le programme : on attend Safari
      apply(h);
      // Aucun clavier finalement (clavier physique branché…) : on rend la place
      clearTimeout(fallback);
      fallback = setTimeout(() => { if (measure() === 0) apply(0); }, 700);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isTextEntry(e.relatedTarget)) return;   // d'un champ à l'autre : le clavier reste
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!isTextEntry(document.activeElement)) apply(0); });
    };
    // Nouvelle étape : si plus aucun champ n'a le focus (après le focus posé par l'étape), le clavier se ferme
    stepChanged.current = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!isTextEntry(document.activeElement)) apply(0); });
    };

    vv.addEventListener("resize", onResize);
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      vv.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [target]);

  useEffect(() => { stepChanged.current(); }, [step]);
}
