"use client";

import dynamic from "next/dynamic";
import FoodLoader from "@/components/ui/FoodLoader";
import type { MerchantMapProps } from "./MerchantMap";

/**
 * Point d'entrée de la carte : Leaflet a besoin de `window`, il est donc chargé
 * uniquement dans le navigateur (pas de rendu serveur), dans un fichier JavaScript séparé.
 */
const MerchantMap = dynamic(() => import("./MerchantMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#e8eaed] dark:bg-[#1f2329]">
      <FoodLoader label="Chargement de la carte…" detail="Les commerces de La Roche-sur-Yon arrivent" />
    </div>
  ),
});

export default function MapView(props: MerchantMapProps) {
  return <MerchantMap {...props} />;
}

export type { MerchantMapProps };
