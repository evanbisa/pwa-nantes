import type { Metadata } from "next";
import TeamDashboard from "@/components/dashboard/TeamDashboard";
import { THEME_SCRIPT } from "@/lib/legal/theme";

export const metadata: Metadata = {
  title: "Tableau de bord · FlashMiam",
  description: "Chiffres de FlashMiam, réservés à l'équipe.",
  robots: { index: false, follow: false },
};

/** Tableau de bord de l'équipe : thème jour / nuit de la carte, chiffres chargés après connexion. */
export default function DashboardPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <TeamDashboard />
    </>
  );
}
