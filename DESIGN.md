# FlashMiam : système visuel « étiquette du marché »

Référence du style de FlashMiam (carte `index.html` et application `web/`). Toute nouvelle page ou composant en hérite ;
on ne réinvente pas un style par écran. Mis en place le 26/11/2026 (refonte avec le skill `impeccable`).

## L'idée

FlashMiam, c'est le marché des Halles de La Roche-sur-Yon dans la poche : un plan clair, des restaurants en orange, des
bons plans nets et lisibles. Les couleurs ont chacune un rôle, et un seul :

| Rôle | Jour | Nuit | Sert à |
|---|---|---|---|
| Encre (`--text`, `--shell`) | `#16213a` | `#f2f4f8` / barre `#0a111e` | texte, barre d'onglets, filtres actifs |
| Orange du logo (`--brand`) | `#ff4d2e` | `#ff6a45` | ce qui se touche : bouton principal, « Valider ma visite », repère choisi, anneau des stories |
| Orange texte (`--accent`) | `#d9361a` | `#ff8a73` | liens et mots en orange sur fond clair (contraste 4,7:1) |
| Papier (`--panel-solid`) | `#ffffff` | `#16223a` | panneaux, fiches |
| Fond (`--bg`) | `#eef0f4` | `#0e1626` | derrière les panneaux |

- Le texte posé sur l'orange est **à l'encre** (`--on-brand`), jamais blanc : contraste 4,8:1.
- Le jaune fluo (`--flash`) n'est plus utilisé : essayé pour les bons plans, écarté par l'utilisateur le 26/11/2026.
- États : ouvert `--green` (#0e7c45 / #5fd39a), bientôt fermé `--amber`, fermé `--danger`. Le bleu `--blue` reste réservé à
  « ma position » sur la carte.
- La carte (style `flashmiam`, palettes `MARCHE` / `MARCHE_NUIT` dans `index.html`) est un plan calme : routes blanches,
  grands axes jaune paille, parcs verts, eau bleue, textes à l'encre. Aucun orange sur le plan : l'orange, ce sont les
  restaurants.

## Typographie

Une seule famille, **Archivo** (variable, licence OFL, servie par le site : `vendor/fonts/`), deux voix :

- **Interface** : largeur normale (100 %), graisse 400 à 650, 15 px de base.
- **Étiquette** (`--font-tag`) : étroite (`font-stretch` 70 à 85 %) et grasse (750 à 850) pour les titres de panneaux
  (28 px), le titre d'accueil (40 px), les prix, les titres des bons plans et les intitulés de rubrique.
- Pas de petites capitales espacées au-dessus des titres, pas de mot isolé mis en couleur dans un titre.
- Chiffres alignés (`tabular-nums`) pour les prix, compteurs et statistiques.

## Formes et profondeur

- Coins nets : 10 à 12 px pour les boutons, puces et champs ; 14 px pour la recherche et les gros boutons ; 22 px pour le
  haut des fiches. Plus de pilules partout (seuls les repères et avatars restent ronds).
- Ombres portées vers le bas, teintées d'encre (`--shadow`, `--shadow-lift`) ; jamais de halo coloré ni de verre dépoli.
- Puce active (filtres, types d'offres) : remplie d'encre, texte papier.

## Les bons plans (style « sobre », choisi par l'utilisateur le 26/11/2026)

Cadre papier (`--panel-solid`) bordé d'un filet (`--line-strong`), coins de 12 px, carré « % » orange (`--brand`, texte encre)
à gauche, titre de l'offre en lettres d'étiquette (Archivo étroite, 800). Même orange pour le « % » des repères de la
carte (`.pin-flag`) et la pastille du nombre d'offres. À l'accueil, les avantages sont une simple liste à coches orange.

## Ce qui ne change pas

- Le logo (épingle orange avec couverts), l'orange comme couleur de marque, les emojis des catégories sur la carte
  (choix du 26/11/2026).
- La disposition des écrans et les parcours.

## Où c'est écrit

- `index.html` : jetons de couleur en tête de `<style>` (`:root[data-theme=…]`), puis la couche « REFONTE « ÉTIQUETTE DU
  MARCHÉ » » en fin de `<style>` (composants). Nouveau composant : utiliser les jetons, pas de couleur en dur.
- `web/app/globals.css` : même police ; les gammes Tailwind `slate` et `zinc` sont remplacées par l'encre, `orange` par
  l'orange du logo, donc les classes existantes (`text-slate-900`, `bg-orange-600`…) suivent le système.

## Direction (contrat de la refonte, pour les relectures)

- THESIS : le marché en poche ; on refuse la copie grise de Google Maps et la carte blanche d'appli de livraison.
- OWN-WORLD : encre bleu marine, orange du logo pour l'action et les bons plans (cadres sobres), papier blanc ; Archivo
  étroite et grasse.
- STORY : on ouvre, on voit les restaurants (repères orange) et les bons plans (« % » orange), on touche, on profite
  de l'offre avec le QR code.
- FIRST VIEWPORT : recherche en haut, stories, bouton Filtres, carte calme, barre d'onglets à l'encre.
- FORM : application (mode « Operate ») ; le monde ne fournit que la typo, la palette et la densité.
  seed: none (pinned) — monde choisi avec l'utilisateur (« garder le logo, l'orange, les emojis ; que ça donne envie »).
