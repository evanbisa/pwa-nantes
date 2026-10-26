import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlashMiam",
  description: "La carte des food-trucks, kebabs, burgers et douceurs de La Roche-sur-Yon.",
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
