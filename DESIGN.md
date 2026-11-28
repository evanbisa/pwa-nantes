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
- **Sans ombres sous les cartes (28/11/2026, demande de l'utilisateur)** : cartes, blocs, fiches, barres et panneaux
  sont à plat, séparés par un filet (`--line`, `--line-strong`) ; `--shadow` et `--shadow-lift` valent `none`. Sur la
  carte (mode jour), un filet un peu plus marqué remplace l'ombre de la recherche, des stories, des boutons et des noms
  des restaurants (ces derniers tracés à l'intérieur : même taille, donc même tri des noms qui se chevauchent).
  Restent les ombres qui ont un rôle : anneaux de focus et de sélection, voile du guide et du cadrage photo, contour
  des pastilles, boules des interrupteurs et curseurs, repères de la carte. Jamais de halo coloré ni de verre dépoli.
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
  ferment avec l'élan, sinon reviennent avec un ressort. Dans la fiche, l'avatar du restaurant ouvre ses stories, les
  mêmes que la barre du haut (celles d'exemple de la fiche d'exemple comprises) : anneau orange tant qu'il en reste à
  voir, gris ensuite, comme dans la barre ; il s'enfonce légèrement sous le doigt (28/11/2026).
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
- **Fluidité de la carte et du QR code (28/11/2026)** :
  - carte dessinée à 2× au plus (`pixelRatio`) : sur un écran 3×, 2,25 fois moins de pixels par image ;
  - halos des restaurants ouverts en pause pendant un glissement ou un zoom (`#map.is-moving`) ;
  - tri des noms qui se chevauchent : positions lues d'abord, classes posées ensuite (un seul recalcul de style), au
    plus ~7 fois par seconde pendant un zoom, puis à la fin du mouvement ;
  - QR code : la demande part dès que le doigt se pose sur le bouton (en même temps que le chargement du générateur),
    le QR monte avec l'écran s'il est déjà prêt ; apparition par opacité et échelle (plus de flou animé), dégradé
    d'attente par `transform` ;
  - « En profiter » depuis la liste des offres : le commerce est placé d'un coup sur la carte, cachée par le QR code ;
  - mesuré (Chrome, écran 3×, processeur ralenti 4×) : glissement 25 → 36 images, zoom 7 → 21 images, ouverture d'une
    fiche 25 → 41 images ; QR code net et immobile 0,78 → 0,51 s après le toucher (base qui répond en 0,18 s).
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
- **Guide de démarrage, fin du parcours (28/11/2026)** : 9 étapes pour un client. 6. toucher un restaurant ; 7. toucher
  « Valider ma visite » ; 8. le QR code ; 9. toucher la croix. Quand l'écran change (fiche qui s'ouvre, QR code qui
  s'affiche), les mouvements se suivent sans se chevaucher : bulle et projecteur s'effacent (0,2 s), la fiche monte puis
  descend toute seule jusqu'au bouton (défilement image par image, après son arrivée : sur iPhone, un défilement lancé
  pendant la montée était perdu), et seulement ensuite projecteur et nouvelle consigne apparaissent sur la cible. La
  croix ferme le QR code et la fiche, puis la carte recule sur tous les restaurants de la ville (zoom 14 au plus près).
- **Anti-robots (Cloudflare Turnstile)** : invisible le plus souvent ; si Cloudflare demande une action, la case
  s'affiche au centre de l'écran sur un voile, et s'efface dès la fin de la vérification (réussie ou non).
- **Espace restaurateur (28/11/2026, skill `apple-design`)** : fond groupé gris doux (`--bg`) et cartes blanches sans
  bordure (`--panel-solid`), comme les listes groupées d'iPhone ; grand titre « Bonjour … » (28 px, 34 px sur
  ordinateur), titres de partie en 20 px gras, chiffres en SF Pro Rounded (`ui-rounded`) aux chiffres alignés,
  tendances en flèches colorées sans pastille. Accueil dans l'ordre : période (commande segmentée pleine largeur),
  « Scanner un client » (orange plein, texte encre), 6 chiffres clés avec icônes dessinées, « À faire » et
  « Ce qu'il faut retenir » en listes groupées (filet décalé), raccourcis en 4 colonnes d'icônes, courbe des vues.
  Barre d'onglets du téléphone à l'encre pleine, comme celle de la carte. Mouvement : ouverture et fermeture par le
  même chemin (montée de 26 px, 0,44 s / descente 0,24 s), fondu court entre onglets, curseur de la commande segmentée
  qui glisse (0,34 s, courbe d'iOS), barres qui poussent à l'ouverture et au changement de période, anciens chiffres
  estompés pendant le chargement d'une autre période (retour à la précédente si elle ne charge pas), filet sous
  l'en-tête seulement quand le contenu défile dessous. Focus posé sur le panneau (aucun cadre de focus après un toucher).
- **Titre de l'accueil** : 2 ou 3 lignes sur tous les téléphones ; taille selon la largeur du cadre (`cqi`, plafond
  34 px, 28 px sur écran bas), puis ajustée par `fitWelcomeTitle` si la police du téléphone est plus large.
- **Réglages du téléphone** : « Réduire les animations » remplace les glissements des fiches par un fondu court ;
  « Augmenter le contraste » renforce filets, textes secondaires et contour de focus ; « Réduire la transparence » rend
  panneaux et voiles opaques.
- Pas de verre dépoli ni de barres translucides malgré l'usage d'Apple : le monde « étiquette du marché » garde ses
  surfaces pleines (choix de la refonte du 26/11/2026).

## Vitesse et accessibilité (skill `modern-web-guidance`, 28/11/2026)

Audit demandé sans rien changer à l'apparence : captures avant/après comparées au pixel près (site, pages `/app/`).
Mesures en 4G lente (1,6 Mbit/s, 150 ms) sur téléphone moyen (processeur 4× plus lent), HTTP/2 comme sur Vercel.

- **Ordre des téléchargements** (`index.html`, en tête) : Supabase (`preload`, `fetchpriority="high"`) passe avant le
  moteur de carte (`modulepreload`, `fetchpriority="low"`) ; connexion à Supabase ouverte d'avance (`preconnect`) ;
  calcul des tuiles demandé dès la page chargée (`prefetch`, même adresse que MapLibre, `?v=` = sa version). Mesuré :
  démarrage du site 3,7 → 1,9 s, premier affichage 3,8 → 2,3 s, restaurants sur la carte 0,3 à 0,5 s plus tôt. En
  changeant une bibliothèque de `vendor/`, changer aussi ces adresses.
- **Une image = une adresse** : le logo `icon-192.png?v=2` partout (il était téléchargé deux fois, avec et sans `?v=2`).
- **Pas de texte qui saute au chargement** : la mention « © OpenStreetMap » est repliée en bouton « i » dès que MapLibre
  la remplit (elle s'affichait dépliée puis sautait : décalage de mise en page 0,05 → 0).
- **Fiche ouverte ou fermée** : la liste des restaurants n'est plus reconstruite, seule la marque de sélection change
  (4 à 6 fois moins de travail ; le bouton touché garde le focus clavier, Échap y ramène).
- **Pages `/app/` (Next.js)** : rien de lourd dans la mise en page commune. Le client Supabase n'est chargé par
  `BugReporter` qu'au premier bug à envoyer (−62 Ko compressés sur l'accueil et les pages juridiques). Zones pour les
  lecteurs d'écran : `<main>` au tableau de bord avant connexion, `<aside>` autour de « J'ai déjà un compte ».
- **Contraste** : gris secondaire `slate-500` de `/app/` en `#67728a` le jour (4,5:1 au moins ; 2 % plus foncé,
  invisible à l'œil), `#6c7790` gardé la nuit. Numéros d'articles des pages juridiques (« 1. », « 2. »… devant les
  titres) : couleur des textes secondaires, comme dans le sommaire (`text-slate-500 dark:text-slate-400`) ; ils
  étaient en gris clair (2,5:1 le jour, 3,6:1 la nuit). Changement visible, validé par l'utilisateur le 28/11/2026.
  Règle : tout texte, même un numéro, à 4,5:1 au moins sur son fond (3:1 au-delà de 24 px, ou 18,7 px en gras).
- **Déjà bons, vérifiés** : aucune erreur axe-core sur le site (téléphone, ordinateur, jour, nuit), animations
  permanentes en `transform`/`opacity` seulement, images en chargement différé, écouteurs de toucher passifs.
- **Écarté** : `<meta name="text-scale">` (taille de texte du téléphone) : Chrome 146 seulement, et le site est en
  pixels fixes ; l'adopter changerait l'apparence.

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
