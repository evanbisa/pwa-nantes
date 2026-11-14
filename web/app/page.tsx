import type { Metadata } from "next";
import GoToMap from "@/components/home/GoToMap";

/**
 * /app/ : renvoie vers la carte (site principal). La future carte de l'application (components/home/HomeMap) reste
 * dans le dépôt pour la suite de la migration, mais n'est plus publiée tant qu'elle montre des fiches d'exemple.
 */
export const metadata: Metadata = { robots: { index: false } };

export default function Home() {
  return <GoToMap />;
}
