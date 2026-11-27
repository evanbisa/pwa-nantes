# Vidéo de présentation FlashMiam

`flashmiam-presentation.mp4` : vidéo verticale 1080 × 1920 (TikTok, Reels, Stories, Shorts), 24,5 s, 30 images/s, sans son.

| Temps | Scène |
|---|---|
| 0 – 3 s | « 12 h 15. Vous avez faim. Mais où manger ? » |
| 3 – 8 s | Le plan en pentagone de La Roche-sur-Yon se dessine, les restaurants s'allument |
| 8 – 12 s | Zoom sur un restaurant, sa fiche et ses bons plans |
| 12 – 16,5 s | On touche l'offre : QR code à montrer en caisse, « Offre validée ! » |
| 16,5 – 20,5 s | Stories des restaurants |
| 20,5 – 24,5 s | Logo, « flashmiam.fr », gratuit |

- Restaurants, offres et code affichés : **exemples fictifs** (le restaurant porte l'étiquette « Exemple », comme dans
  l'appli). Le QR code de la vidéo mène réellement à https://flashmiam.fr.
- **Son** : à ajouter au moment de publier (son tendance de TikTok / Instagram, ou CapCut) ; pas de musique dans le
  fichier pour éviter les problèmes de droits.
- Zones à éviter sur TikTok et Reels (boutons de l'appli) : rien d'important en bas de l'écran ni contre le bord droit.

## Modifier et refaire la vidéo

- `index.html` : l'animation (textes, couleurs, minutage dans le `<script>`). Pour la voir : servir le dépôt
  (`python3 -m http.server` à la racine) et ouvrir `/marketing/motion/index.html` ; `?t=12` s'arrête à 12 s.
- `node marketing/motion/render.mjs` : refait le MP4, image par image (Playwright et ffmpeg, environ 1 min 30).
- Style : celui de l'appli au 27/11/2026 (`DESIGN.md`), avec la police Archivo servie depuis `vendor/fonts/` (l'appli est passée
  depuis à la police du système : la vidéo garde Archivo tant qu'elle n'est pas refaite).
