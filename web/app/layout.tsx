import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { OG_IMAGE } from "@/lib/seo";
import BugReporter from "@/components/BugReporter";
import "./globals.css";

/** Adresse principale du site (aperçu des liens partagés) : flashmiam.fr, ou NEXT_PUBLIC_SITE_URL pour une autre adresse. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://flashmiam.fr";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "FlashMiam",
  description: "La carte des food-trucks, kebabs, burgers et douceurs de La Roche-sur-Yon.",
  openGraph: { type: "website", siteName: "FlashMiam", locale: "fr_FR", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",   // mode jour par défaut (le mode nuit se choisit sur la carte)
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : le thème des pages juridiques est posé sur <html> avant React (app/legal/layout.tsx)
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full">{children}<BugReporter /></body>
    </html>
  );
}
