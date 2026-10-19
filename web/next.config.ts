import type { NextConfig } from "next";

/**
 * Site 100 % statique (pas de serveur) : publié gratuitement sur GitHub Pages.
 * Comptes, données et sécurité sont gérés par Supabase (Auth + RLS) directement depuis le navigateur.
 * NEXT_PUBLIC_BASE_PATH = sous-dossier de publication (ex. « /pwa-nantes/app » sur GitHub Pages), vide en local.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true, // /pro → /pro/index.html : servi tel quel par GitHub Pages
  images: { unoptimized: true }, // pas de serveur d'optimisation d'images
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
