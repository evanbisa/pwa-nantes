"use client";

import dynamic from "next/dynamic";
import type { MerchantMapProps } from "./MerchantMap";

/**
 * Point d'entrée de la carte : Leaflet a besoin de `window`, il est donc chargé
 * uniquement dans le navigateur (pas de rendu serveur), dans un fichier JavaScript séparé.
 */
const MerchantMap = dynamic(() => import("./MerchantMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#e8eaed] text-sm text-[#5f6368] dark:bg-[#1f2329] dark:text-[#9aa0a6]">
      <span className="animate-pulse">Chargement de la carte…</span>
    </div>
  ),
});

export default function MapView(props: MerchantMapProps) {
  return <MerchantMap {...props} />;
}

export type { MerchantMapProps };
