import type { Metadata } from "next";
import HomeMap from "@/components/home/HomeMap";
import { DEMO_MERCHANTS } from "@/lib/demo-merchants";

/** Démonstration de la future carte (fiches d'exemple) : pas proposée aux moteurs de recherche. */
export const metadata: Metadata = { robots: { index: false } };

export default function Home() {
  // Étape suivante de la migration : lecture des fiches publiées dans Supabase (table `merchants`)
  return (
    <main className="fixed inset-0">
      <HomeMap merchants={DEMO_MERCHANTS} />
    </main>
  );
}
