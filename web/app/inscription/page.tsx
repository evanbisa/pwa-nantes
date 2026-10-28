import type { Metadata } from "next";
import SignupWizard from "@/components/signup/SignupWizard";
import { THEME_SCRIPT } from "@/lib/legal/theme";

export const metadata: Metadata = {
  title: "Créer un compte · FlashMiam",
  description: "Inscription gratuite à FlashMiam, la carte des bons plans food des étudiants de La Roche-sur-Yon.",
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
