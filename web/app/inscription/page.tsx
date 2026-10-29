import type { Metadata } from "next";
import SignupWizard from "@/components/signup/SignupWizard";
import { THEME_SCRIPT } from "@/lib/legal/theme";
import { OG_IMAGE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Créer un compte · FlashMiam",
  description: "Inscription gratuite à FlashMiam, la carte des bons plans food des étudiants de La Roche-sur-Yon.",
  // (openGraph d'une page remplace celui de la mise en page : image et nom du site répétés)
  openGraph: {
    type: "website", siteName: "FlashMiam", locale: "fr_FR", images: [OG_IMAGE],
    title: "Créer un compte FlashMiam", description: "Gratuit : les food-trucks et bons plans de La Roche-sur-Yon sur une carte.",
  },
};

/** Inscription d'un client, une question par écran. Thème jour / nuit : celui choisi sur la carte, sinon le système. */
export default function SignupPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <SignupWizard />
    </>
  );
}
