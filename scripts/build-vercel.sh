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
cp index.html confidentialite.html conditions.html sw.js icon-192.png icon-512.png dist/
cp -r vendor dist/   # bibliothèque Supabase (servie par le site lui-même)
cp -r web/out dist/app
printf 'User-agent: *\nAllow: /\n' > dist/robots.txt
# Toute adresse inconnue renvoie vers la carte
printf '%s\n' '<!DOCTYPE html><html lang="fr"><meta charset="utf-8"><title>FlashMiam</title>' \
  '<meta http-equiv="refresh" content="0; url=/"><a href="/">Retour à la carte</a></html>' > dist/404.html
