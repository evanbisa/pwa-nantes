import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { OG_IMAGE } from "@/lib/seo";
import "./globals.css";

/** Adresse principale du site (aperçu des liens partagés) : NEXT_PUBLIC_SITE_URL, à changer le jour du nom de domaine. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pwa-nantes.vercel.app";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#202124" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : le thème des pages juridiques est posé sur <html> avant React (app/legal/layout.tsx)
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full">{children}</body>
    </html>
  );
}
