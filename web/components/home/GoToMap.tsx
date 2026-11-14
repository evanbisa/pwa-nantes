"use client";

import { useEffect } from "react";

/** Carte FlashMiam : le site principal (index.html), un dossier au-dessus de l'application. */
const MAP = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/../`;

/**
 * Racine de l'application (/app/) : la vraie carte est le site principal. L'ancienne carte de démonstration
 * (HomeMap, fiches d'exemple) n'est plus servie ici : ses restaurants fictifs, dont deux marqués « vérifiés »,
 * pouvaient être pris pour de vrais. Redirection immédiate, avec un lien si JavaScript tarde.
 */
export default function GoToMap() {
  useEffect(() => { window.location.replace(new URL(MAP, window.location.href).href); }, []);
  return (
    <main className="grid h-full place-items-center p-6 text-center">
      <p className="text-slate-600">
        Ouverture de la carte…{" "}
        <a className="font-semibold text-brand underline" href={MAP}>Ouvrir FlashMiam</a>
      </p>
    </main>
  );
}
