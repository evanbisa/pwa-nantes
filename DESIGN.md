# FlashMiam : système visuel « étiquette du marché »

Référence du style de FlashMiam (carte `index.html` et application `web/`). Toute nouvelle page ou composant en hérite ;
on ne réinvente pas un style par écran. Mis en place le 26/11/2026 (refonte avec le skill `impeccable`) ; le 27/11/2026,
typographie d'Apple et orange plus rare (skill `apple-design`, demande de l'utilisateur).

## L'idée

FlashMiam, c'est le marché des Halles de La Roche-sur-Yon dans la poche : un plan clair, des restaurants en orange, des
bons plans nets et lisibles. Les couleurs ont chacune un rôle, et un seul ; l'orange est rare, donc il se remarque :

| Rôle | Jour | Nuit | Sert à |
|---|---|---|---|
| Encre (`--text`, `--shell`) | `#16213a` | `#f2f4f8` / barre `#0a111e` | texte, barre d'onglets, filtres actifs |
| Orange du logo (`--brand`) | `#ff4d2e` | `#ff6a45` | voir « Où va l'orange » ci-dessous |
| Encre pleine (`--strong`) | `#16213a` | `#2a3858` | grands blocs d'action secondaires : « Valider ma visite », avatar, bandeau d'aperçu |
| Orange texte (`--accent`) | `#d9361a` | `#ff8a73` | liens (contraste 4,7:1) |
| Papier (`--panel-solid`) | `#ffffff` | `#16223a` | panneaux, fiches |
| Fond (`--bg`) | `#eef0f4` | `#0e1626` | derrière les panneaux |

- Le texte posé sur l'orange est **à l'encre** (`--on-brand`), jamais blanc : contraste 4,8:1.

### Où va l'orange (27/11/2026)

L'utilisateur trouvait l'orange trop présent. Il est **réservé** à :

- l'action principale d'un écran (`.btn-primary`, « Créer mon compte », « Voir N restaurants », « Continuer ») ;
- les offres : gros blocs des offres dans une fiche, carré « % », pastille du nombre d'offres, repère « % » de la carte ;
- les restaurants sur la carte et le repère choisi ; l'icône de l'onglet actif ; l'anneau des stories non vues ;
- les liens texte (`--accent`) ; l'anneau du temps qui reste autour du QR code.

Tout le reste passe à l'encre ou au gris :

- petites commandes pleines (bouton « À pied », « Suivant » du guide, « Me localiser », pastilles cochées) : encre le
  jour, blanc la nuit (`--text` sur `--panel-solid`, comme la puce active) ;
- ronds d'action de la fiche, carré de l'emoji, encarts d'information, étiquettes « Exemple » : gris (`--hover`, `--line`) ;
- icônes des infos (adresse, horaires…) : `--muted` ; curseurs, progression, choix cochés : encre ;
- contour de focus et champ actif : encre (`--focus-border`), contraste 15:1 au lieu de 3,2:1 ;
- « me localiser » et « ma position » : bleu (`--blue`), comme sur Plans.
- Le jaune fluo (`--flash`) n'est plus utilisé : essayé pour les bons plans, écarté par l'utilisateur le 26/11/2026.
- États : ouvert `--green` (#0e7c45 / #5fd39a), bientôt fermé `--amber`, fermé `--danger`. Le bleu `--blue` reste réservé à
  « ma position » sur la carte.
- La carte (style `flashmiam`, palettes `MARCHE` / `MARCHE_NUIT` dans `index.html`) est un plan calme : routes blanches,
  grands axes jaune paille, parcs verts, eau bleue, textes à l'encre. Aucun orange sur le plan : l'orange, ce sont les
  restaurants.

## Typographie (style Apple, skill `apple-design`, 27/11/2026)

**La police du système** (`--font-ui` : `-apple-system, BlinkMacSystemFont, system-ui, …`) : SF Pro sur iPhone et Mac,
Roboto sur Android, Segoe sur Windows. Rien à télécharger (Archivo n'est plus utilisée par le site ; ses fichiers restent
dans `vendor/fonts/` pour la vidéo `marketing/motion`).

Les tailles, graisses et interlignes suivent les styles de texte d'iOS ; la hiérarchie vient des trois ensemble :

| Style d'iOS | Taille / interligne | Graisse | Où |
|---|---|---|---|
| Large Title | 34 / 41 px | 700 | titre de l'accueil |
| Title 1 | 28 / 34 px | 700 | titre des fiches et panneaux, titres de l'inscription |
| Title 2 | 22 / 28 px | 700 | sous-titres de panneau, titre de la bulle du guide |
| Title 3 | 20 / 25 px | 600 | rubriques de la carte du restaurant, groupes de résultats |
| Headline | 17 / 22 px | 600 | boutons, titres des offres, intitulés des filtres, prix |
| Body | 17 / 22 px | 400 | description du restaurant, champ de recherche |
| Subheadline | 15 / 20 px | 400–500 | texte courant de l'interface, puces |
| Footnote / Caption | 13 et 11–12 px | 400–500 | détails, libellés de la barre d'onglets |

- **Espacement des lettres : « normal »**, partout. Sur iPhone et Mac, Safari applique de lui-même la table
  d'espacement de SF Pro, propre à chaque taille (resserrée en texte courant, un peu ouverte pour les titres), comme
  dans les applis d'Apple. En ajouter un doublerait l'effet. Pas de `tracking-tight` dans `web/` non plus (sauf les très
  grands chiffres, 60 px et plus).
- Graisses d'Apple seulement : 400, 500, 600, 700. Plus de `font-stretch`.
- Pas de petites capitales espacées au-dessus des titres, pas de mot isolé mis en couleur dans un titre.
- Chiffres alignés (`tabular-nums`) pour les prix, compteurs et statistiques.

## Formes et profondeur

- Coins nets : 10 à 12 px pour les boutons, puces et champs ; 14 px pour la recherche et les gros boutons ; 22 px pour le
  haut des fiches. Plus de pilules partout (seuls les repères et avatars restent ronds).
- Ombres portées vers le bas, teintées d'encre (`--shadow`, `--shadow-lift`) ; jamais de halo coloré ni de verre dépoli.
- Puce active (filtres, types d'offres) : remplie d'encre, texte papier.

## Les bons plans

- **Dans une fiche, offre utilisable** (compte client, ou visiteur sur une vraie fiche) : chaque offre est un **gros bloc orange**,
  de la même forme que « Valider ma visite » (`.visit-cta.promo-cta`, lui à l'encre) : icône du QR code, titre de l'offre
  (Headline), horaires ou type d'offre, flèche. Le toucher ouvre le QR code avec cette offre (visiteur : invitation à créer son compte).
  Conditions sous le bloc (« Voir les conditions »). Le bloc du haut redevient alors « Valider ma visite » (sans offre),
  avec « N offres plus bas » (choix de l'utilisateur, 27/11/2026).
- **Ailleurs** (restaurant d'exemple, aperçu restaurateur) : style « sobre » : cadre papier bordé d'un filet, coins de 12 px,
  carré « % » orange (`--brand`, texte encre) à gauche (choix du 26/11/2026).
- Même orange pour le « % » des repères de la carte (`.pin-flag`) et la pastille du nombre d'offres. À l'accueil, les
  avantages sont une simple liste à coches à l'encre.

## Mouvement et gestes (skill `apple-design`, 27/11/2026)

- **Retour au toucher immédiat** : tout ce qui se touche réagit dès l'appui (boutons et puces rétrécissent un peu avec
  la propriété `scale`, lignes de liste qui s'assombrissent, liens texte qui pâlissent). Un écouteur `touchstart` sur
  `body` est indispensable : sans lui, Safari sur iPhone n'applique jamais `:active`.
- **Fiches (téléphone)** : elles suivent le doigt à l'identique (poignée, en-tête, ou contenu quand il est en haut), en
  partant de leur position affichée (on les rattrape en plein mouvement). Au lâcher : projection de l'élan
  (décélération 0,998, celle d'iOS) ; fermeture si le point d'arrivée dépasse 40 % de la hauteur (240 px au plus), sinon
  retour par un ressort qui garde la vitesse du doigt (amortissement 1, ou 0,85 après un geste lancé ; réactivité
  0,35 s). Tirées vers le haut : résistance élastique. Ouverture 0,5 s et fermeture 0,38 s sur la courbe des feuilles
  d'iPhone `cubic-bezier(.32, .72, 0, 1)`.
- **Stories** : tirées vers le bas, elles suivent le doigt, rétrécissent un peu et le fond s'éclaircit ; elles se
  ferment avec l'élan, sinon reviennent avec un ressort.
- **Outils** : `Physics` dans `index.html` (ressort d'Apple à deux réglages, projection, élastique, vitesse du doigt).
  `Physics.play` précalcule le ressort et le confie au navigateur (Web Animations) : il reste fluide même quand la carte
  se dessine. Animer `transform`, `opacity`, `translate` ou `scale` ; jamais `top`, `left`, `width` pour un déplacement.
- **Fluidité (skill `animation-performance`, 27/11/2026)** :
  - écouteurs de toucher **passifs** sur les fiches : leur défilement n'attend jamais le JavaScript ; pas de rebond dans
    les fiches (`overscroll-behavior-y: none`), si bien que tout en haut, tirer vers le bas déplace la fiche sans rien
    bloquer (iOS 16 et plus) ;
  - fiche ouverte ou tenue, et story ouverte : leur propre couche graphique (`will-change: transform`) ;
  - barre de progression des stories : une animation du navigateur (`scaleX`), mise en pause et reprise, sans travail
    du fil principal ; halos des restaurants ouverts en pause sous une fiche ouverte ;
  - mesuré (Chrome, mêmes gestes) : retour d'une fiche 31 → 8 recalculs de style ; story 120 mises en page / 2 s → 0.
- **Clavier (27/11/2026, vidéo sur iPhone)** : Safari ne signale l'ouverture du clavier qu'au début de son animation
  (~0,17 s), et sa fermeture ~0,4 s après la fin. On n'attend pas Safari :
  - la page suit la fermeture dès que le champ perd le focus ;
  - elle suit l'ouverture dès que le doigt touche un champ, si la hauteur du clavier est déjà connue (sinon au
    premier signal) ;
  - le contenu glisse sur la courbe d'iOS en 0,25 s par `transform` (technique FLIP : nouvelle mise en page posée
    d'un coup, puis chaque bloc glisse de son ancienne place à la nouvelle) ;
  - la carte blanche de l'inscription garde toute sa hauteur derrière le clavier : jamais de plan de la ville entre
    les deux ;
  - le décalage de la vue (`visualViewport.offsetTop`) n'entre pas dans le calcul de l'inscription : il faisait
    sauter le contenu ;
  - le code est dans `web/components/signup/useKeyboardInset.ts` et le module `Keyboard` de `index.html` ; sur la
    carte, les fiches glissent au-dessus du clavier (`bottom`, 0,25 s).
- **Réglages du téléphone** : « Réduire les animations » remplace les glissements des fiches par un fondu court ;
  « Augmenter le contraste » renforce filets, textes secondaires et contour de focus ; « Réduire la transparence » rend
  panneaux et voiles opaques.
- Pas de verre dépoli ni de barres translucides malgré l'usage d'Apple : le monde « étiquette du marché » garde ses
  surfaces pleines (choix de la refonte du 26/11/2026).

## Ce qui ne change pas

- Le logo (épingle orange avec couverts), l'orange comme couleur de marque, les emojis des catégories sur la carte
  (choix du 26/11/2026).
- La disposition des écrans et les parcours.

## Où c'est écrit

- `index.html` : jetons de couleur en tête de `<style>` (`:root[data-theme=…]`), puis la couche « REFONTE « ÉTIQUETTE DU
  MARCHÉ » » en fin de `<style>` (composants). Nouveau composant : utiliser les jetons, pas de couleur en dur.
- `web/app/globals.css` : même police du système ; les gammes Tailwind `slate` et `zinc` sont remplacées par l'encre,
  `orange` par l'orange du logo, donc les classes existantes (`text-slate-900`, `bg-orange-600`…) suivent le système.
  Même règle de l'orange : onglet actif, pastilles d'icônes, progression et champ actif à l'encre (`slate-900`).

## Direction (contrat de la refonte, pour les relectures)

- THESIS : le marché en poche ; on refuse la copie grise de Google Maps et la carte blanche d'appli de livraison.
- OWN-WORLD : encre bleu marine, orange du logo réservé à l'action principale et aux bons plans, papier blanc ; police
  du système et styles de texte d'iOS (27/11/2026).
- STORY : on ouvre, on voit les restaurants (repères orange) et les bons plans (« % » orange), on touche, on profite
  de l'offre avec le QR code.
- FIRST VIEWPORT : recherche en haut, stories, bouton Filtres, carte calme, barre d'onglets à l'encre.
- FORM : application (mode « Operate ») ; le monde ne fournit que la typo, la palette et la densité.
  seed: none (pinned) — monde choisi avec l'utilisateur (« garder le logo, l'orange, les emojis ; que ça donne envie »).
