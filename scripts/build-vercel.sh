#!/bin/sh
# Construction du site pour Vercel (même contenu que GitHub Pages) :
#   /      → site complet (index.html)
#   /app/  → nouvelle application Next.js (dossier web/, export statique)
set -e
cd web
npm run lint
NEXT_PUBLIC_BASE_PATH=/app npm run build   # inclut la vérification des types
cd ..
rm -rf dist
mkdir -p dist
cp index.html confidentialite.html conditions.html sw.js icon-192.png icon-512.png favicon.svg og-image.jpg manifest.webmanifest dist/
# Réglages de publication (variable MAP_STYLE : style de la carte), puis politique de sécurité du contenu (CSP)
# recalculée sur les pages publiées : toujours à jour
node scripts/config.mjs dist/index.html
node scripts/csp.mjs dist/index.html dist/confidentialite.html dist/conditions.html
cp -r vendor dist/   # bibliothèque Supabase (servie par le site lui-même)
cp -r web/out dist/app
# Référencement : adresse principale (SITE_URL) dans les balises de partage, robots.txt, sitemap.xml, page 404
node scripts/seo.mjs dist
# Version publiée (numéro du commit, fourni par Vercel) : les vérifications en ligne attendent qu'elle soit arrivée
printf '%s\n' "${VERCEL_GIT_COMMIT_SHA:-${GITHUB_SHA:-}}" > dist/version.txt
