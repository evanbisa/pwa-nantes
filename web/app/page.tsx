import HomeMap from "@/components/home/HomeMap";
import { DEMO_MERCHANTS } from "@/lib/demo-merchants";

export default function Home() {
  // Étape suivante de la migration : lecture des fiches publiées dans Supabase (table `merchants`)
  return (
    <main className="fixed inset-0">
      <HomeMap merchants={DEMO_MERCHANTS} />
    </main>
  );
}
