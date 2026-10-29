"use client";

import { useEffect, useState } from "react";

/**
 * Clavier des téléphones : sur iPhone et Chrome Android, la page garde sa taille et seule la partie visible
 * (window.visualViewport) rétrécit ; Safari peut aussi décaler la vue. Renvoie la hauteur recouverte par le clavier
 * (0 s'il est fermé), à ajouter en marge sous la page pour pouvoir la faire défiler, et amène le champ actif juste
 * au-dessus du clavier. Navigateurs où la page rétrécit (Firefox Android) : rien à faire, la page défile d'elle-même.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !el.matches("input, textarea, [role=slider]")) return;
      const r = el.getBoundingClientRect();
      const top = vv.offsetTop + 12, bottom = vv.offsetTop + vv.height - 12;
      const delta = r.bottom > bottom ? r.bottom - bottom : r.top < top ? r.top - top : 0;
      if (delta) window.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        setInset(covered > 80 ? covered : 0);
        frame = requestAnimationFrame(reveal);   // après la mise en page avec la marge du clavier
      });
    };
    // Champ touché alors que le clavier est déjà ouvert : pas de redimensionnement, on l'amène quand même en vue
    const onFocus = () => { clearTimeout(timer); timer = setTimeout(reveal, 320); };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);
  return inset;
}
