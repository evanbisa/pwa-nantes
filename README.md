# FlashMiam

Carte interactive (PWA) des food-trucks, kebabs, burgers et douceurs de La Roche-sur-Yon, avec les bons plans du
moment, les stories des restaurants, les avis et un QR code de visite à montrer en caisse.

**Site en ligne : https://flashmiam.fr** (aussi https://pwa-nantes.vercel.app ; copie sur
https://evanbisa.github.io/pwa-nantes/).

## Organisation du dépôt

| Partie | Où | Rôle |
| --- | --- | --- |
| La carte (site principal) | `index.html` (+ `sw.js`, `manifest.webmanifest`, `vendor/`) | Tout le site client et restaurateur : carte MapLibre, fiches, recherche, offres, stories, avis, notifications, profil, espace restaurateur, scanner de QR codes. Un seul fichier, sans étape de construction. |
| L'application | `web/` (Next.js, export statique publié sous `/app/`) | Inscription des clients (`/app/inscription/`), pages juridiques (`/app/legal/`), tableau de bord de l'équipe (`/app/tableau-de-bord/`). `/app/` renvoie vers la carte. Voir `web/README.md`. |
| Le serveur | Supabase (projet `fnypgfyxbyaqrnklhjxc`) : `web/supabase/` | Comptes, base de données protégée par RLS (`migrations/`), fonctions serveur (`functions/` : SIRET, inscription, paiement Whop, alertes push, lecture de carte sur photo, suppression de compte, ménage), tests. |
| Publication | `vercel.json`, `scripts/build-vercel.sh`, `.github/workflows/` | Vercel republie à chaque modification de la branche principale ; GitHub Pages et Cloudflare Pages en copies. Vérifications automatiques en ligne, contrôle des secrets, sauvegarde chiffrée chaque nuit. |

État de la sécurité et de la mise en ligne (ce qui est fait, ce qui reste à régler) :
[`web/docs/SECURITE-ETAT.md`](web/docs/SECURITE-ETAT.md).

## Interface (novembre 2026)

- **Téléphone** : une barre de recherche en haut (logo, « Un plat, un restaurant… »), les filtres juste dessous
  (Ouverts, Promos, 4 et + d'abord), les stories, un seul bouton flottant (me localiser) et une **barre d'onglets** en
  bas : Carte, Offres, Alertes, Profil (« Mon resto » pour un restaurateur). Le thème jour / nuit se règle dans le profil.
- **Fiche** : ouvert / fermé et note sous le nom, puis les actions en une rangée (À pied, En voiture, Appeler, Suivre,
  Partager).
- **Espace restaurateur** : accueil synthétique (période 7 / 30 / 90 jours, 6 chiffres clés avec leur évolution, courbe
  des vues, à faire, 4 actions rapides, 3 points à retenir) ; statistiques avec un sommaire toujours visible, les
  **visites validées en caisse** (QR codes scannés) et le détail par jour téléchargeable (CSV).

## Moments, titres-restaurant et lieux (novembre 2026)

Pour toucher aussi les jeunes actifs et les trentenaires, pas seulement les étudiants :

- **Types d'offres** : en plus de « du jour », « de la semaine », « étudiante » et « bon plan », le restaurateur peut
  publier une **formule midi**, un **afterwork / happy hour** et une offre **du week-end** (brunch…), retirée
  automatiquement le dimanche soir (migration `20261119085900_promo_kinds_meal_vouchers.sql`).
- **Filtres de la carte** : ☀️ Midi (ouvert entre 12 h et 14 h aujourd'hui, ou formule midi en cours), 🌙 Ce soir
  (ouvert entre 19 h et 22 h, ou afterwork), 🥞 Ce week-end (ouvert samedi ou dimanche, ou offre du week-end), un seul
  moment à la fois ; 🎫 Titres-resto (restaurants qui les acceptent).
- **Titres-restaurant** : case « J'accepte les titres-restaurant » dans la fiche du restaurateur (colonne
  `merchants.accepts_meal_vouchers`) ; ligne « 🎫 Titres-restaurant acceptés » dans la fiche.
- **Mes lieux** : le client enregistre son **travail** et son **école / lieu d'études** (adresse cherchée dans la
  Base Adresse Nationale). Le lieu choisi devient le point de départ des distances (liste, offres, fiche : « 1,5 km
  depuis l'école »). Puce « 📍 Ma position ▾ » au début des filtres, et « Mes lieux » dans le profil. Les lieux restent
  **sur l'appareil** (`localStorage`, clé `flashmiam:places`) : rien n'est envoyé au serveur.

## Audit du 25 novembre 2026 : ce qui a changé

- **Couleur** : orange du logo partout (carte, espace restaurateur, pages `/app/`) ; le bleu ne sert plus qu'à « ma
  position ». Champ actif orange vif, rouge réservé aux erreurs. Thème par défaut : comme le téléphone.
- **Horaires par jour** (`opening_hours.days`, jusqu'à 3 créneaux par jour, chevauchements refusés) et **fermeture
  exceptionnelle** (`closed_from` / `closed_until` / `closure_note`) : la fiche reste visible avec « Fermé jusqu'au … ».
- **Catégories** : Asiatique, Tacos, Crêperie, Boulangerie, Café, Bar, Cuisine du monde, Traditionnel ; « Sucré ».
  **Infos pratiques** (`amenities` : sur place, terrasse, végétarien, halal…) avec filtres « Pratique » ; **liens**
  Instagram, site, commande (`links`, clics dans les statistiques) ; gamme de prix calculée d'après la carte.
- **Avis vérifiés** (`reviews.verified`, badge « ✓ Visite vérifiée », explication du contrôle des avis) ; option
  « avis réservés aux visites validées » (`reviews_verified_only`).
- **Offres** : modifier, prolonger de 7 jours, republier une offre terminée ; liste client avec ouvert / fermé et fin.
- **Compte client** : prénom et nom, e-mail, mot de passe, « Mes avis », « Mes visites » ; inscription : prénom,
  e-mail, mot de passe, puis sexe et âge.
- **Visiteur** : « Voir la carte » ouvre la carte directement (plus d'écran de localisation).
- **Pages publiques des restaurants** (`scripts/restaurant-pages.mjs`, `/restaurants/<nom>-<id>/`) : Google et
  aperçus des liens partagés. Republication quotidienne si le secret `VERCEL_DEPLOY_HOOK` est enregistré
  (`.github/workflows/pages-restaurants.yml`).
- **Carte de fidélité** (`loyalty_goal`, `loyalty_reward`, table `loyalty_rewards`), **équipiers** qui scannent
  (`merchant_staff`, 5 au plus), **plats** avec étiquettes, photo et « épuisé aujourd'hui » (`menu_json`).

## Visiteurs sans compte

La carte s'ouvre **sans compte** : bouton « Voir la carte → » en haut de l'écran d'accueil (le choix est gardé : les
visites suivantes ouvrent directement la carte), et un lien partagé vers une fiche (`?r=…`) l'ouvre sans passer par
l'inscription. Un visiteur voit les restaurants, les fiches, les menus, les avis et les stories.

- **Offres réservées aux comptes** : un visiteur en voit **3** (les plus proches, dans l'ordre de « Offres autour de
  moi ») ; les autres sont **floutées** avec « Créer un compte pour voir la suite », dans les offres, les fiches et la
  liste. **Verrou côté serveur** : sans compte, la base refuse la lecture de la table des offres ; la fonction
  `guest_promotions()` les compte toutes mais ne renvoie le texte que de 3 (la plus récente de chaque restaurant
  d'abord, les mêmes pour tous les visiteurs) : le texte des autres n'arrive jamais sur l'appareil. Les restaurants
  d'exemple complètent jusqu'à 3 (réglage d'affichage : `GUEST_PROMOS` dans `index.html`).
- **En bas de l'écran** : un grand bouton « Créer mon compte » (rouvre l'écran de création de compte) et « Connexion »,
  dans la barre d'onglets ; sur ordinateur, en bas du panneau latéral.
- Suivre un restaurant, donner un avis, aimer un plat, le QR code de visite et les notifications ouvrent l'écran de
  création de compte avec la raison ; « Revenir à la carte → » y ramène.

## Restaurants d'exemple (démonstration)

Tant que la carte compte **moins de 3 vrais restaurants** en ligne, six restaurants fictifs (liste `SHOPS` de
`index.html`) sont affichés pour montrer FlashMiam, **toujours signalés « Exemple »** (carte, liste, recherche, offres,
stories) avec une note « restaurant imaginaire » dans leur fiche ; la pastille des offres ne les compte pas. Ils
disparaissent d'eux-mêmes dès le 3ᵉ vrai restaurant. Réglage : `CONFIG.demoShops` (`'auto'`, `'on'`, `'off'`) et
`CONFIG.demoUntil`.

- `?demo=1` à la fin de l'adresse (par exemple pour une présentation à un restaurateur) : restaurants d'exemple **et**
  fiches de test visibles ; `?demo=0` : rien de fictif.
- Les **fiches de test** (créées avec le SIRET de test) ne sont visibles que de leur propriétaire, ou avec `?demo=1`.

## Inscription des restaurateurs

1. **Compte** : prénom, nom, e-mail et téléphone professionnels, mot de passe (code de confirmation par e-mail).
2. **Vérification** : le **SIRET** est contrôlé par le serveur (fonction `verify-siret`) dans le répertoire **Sirene**
   de l'INSEE : établissement en activité, **code NAF de restauration** (56.10A/B/C, 56.21Z, 56.30Z, 10.71C/D, 10.52Z,
   47.24Z, 47.81Z), SIRET pas déjà pris ; justificatifs **Kbis** et **attestation HACCP** (privés) ; attestation sur
   l'honneur.
3. **Abonnement** : formules Essentiel, Premium ou sur devis, paiement par Whop (mode démonstration tant que
   `billing_settings.whop_live` est faux ; voir `web/README.md`).
4. **Fiche restaurant** : nom, catégorie, description, 1 à 10 photos carrées (recadrage intégré), adresse (Base Adresse
   Nationale), horaires, téléphone, carte des plats (saisie à la main ou **lue sur photo**, fonction `menu-scan`).

Le restaurateur gère ensuite tout depuis son **espace** (Accueil, Statistiques, Publier, Avis, Ma fiche) et scanne le
QR code de visite de ses clients. Une fiche ne peut être publiée qu'avec un SIRET vérifié, un abonnement actif et une
fiche complète : c'est la base qui le refuse, pas seulement l'interface.

## Style de la carte

La carte (MapLibre, tuiles OpenFreeMap) a cinq styles, tous dessinés par le site lui-même (aucune clé, aucun service
en plus) :

| Valeur | Style | Jour / nuit |
|---|---|---|
| `flashmiam` (par défaut) | **Urbain énergique** en mode jour, **Nuit néon** en mode nuit | suit le mode jour ou nuit |
| `google` | rendu Google Maps (l'ancien style) | suit le mode jour ou nuit |
| `neon` | **Nuit néon** : fond presque noir, grands axes violets et bleus lumineux | toujours sombre |
| `pastel` | **Minimaliste pastel** : fond crème, routes blanches, parcs vert menthe | toujours clair |
| `urbain` | **Urbain énergique** : grands axes corail et orange, eau bleu profond, parcs vert vif | toujours clair |

- **Essayer sans rien publier** : ajouter `?carte=neon` (ou `pastel`, `urbain`, `google`, `flashmiam`) à l'adresse du site,
  par exemple `https://pwa-nantes.vercel.app/?carte=neon`. Le profil indique le style affiché (« Carte »).
- **Choisir le style publié** : variable d'environnement `MAP_STYLE`, appliquée à chaque publication par
  `scripts/config.mjs` :
  - Vercel › projet › *Settings › Environment Variables* : `MAP_STYLE` = `neon`, puis *Redeploy* ;
  - GitHub Pages : dépôt › *Settings › Secrets and variables › Actions › Variables* : `MAP_STYLE` = `neon` ;
  - en local : copier `.env.example` en `.env`, puis `node scripts/config.mjs && node scripts/csp.mjs`
    (modifie `index.html` : ne pas le pousser si ce n'est pas voulu).
- **Style externe** : `MAP_STYLE` peut aussi être l'adresse https d'un style MapLibre (`style.json`, par exemple créé
  avec Maputnik ou MapTiler). Son domaine est ajouté tout seul à la politique de sécurité (`scripts/csp.mjs`) ; si ses
  tuiles ou ses polices viennent d'un autre domaine, l'ajouter dans `appPolicy()`.

## Tableau de bord de l'équipe

- Adresse : `/app/tableau-de-bord/` (aussi depuis le profil : « 📊 Tableau de bord de l'équipe »), réservé aux comptes
  de l'équipe. Une seule page, sections dans la barre latérale (onglets sur téléphone) et dans l'adresse :
  `#verifier`, `#revenus`, `#users`, `#restaurants`, `#fiches`, `#fiches/<restaurant>`, `#bugs`, `#server`.
  - **Fluide** : changer de section ou de période (7 j, 30 j, 90 j, 1 an) ne recharge rien ; les chiffres restent
    affichés pendant la relecture (barre fine en haut) ; sections voisines lues à l'avance ; « En direct » relit tout
    chaque minute tant que la page est visible (clic pour mettre en pause).
  - **Clavier** : `⌘K` / `Ctrl+K` ou `/` (palette : sections, restaurants par nom, responsable, e-mail ou SIRET,
    actions), `1`–`8` sections, `R` actualiser, `T` mode jour / nuit.
  - **Vue d'ensemble** : « À surveiller » (nouveaux bugs, bug corrigé qui revient, tâche planifiée en échec, ménage
    en retard, paiement refusé, quotas de l'offre gratuite, avis signalés, restaurateurs à relancer), 6 chiffres clés
    cliquables, visiteurs et comptes par jour, **restaurateurs inscrits** (e-mail, responsable, téléphone, restaurant ou
    « fiche pas encore créée », état ; liste complète et « Copier les e-mails » dans l'onglet Restaurants), activité
    récente (un nouveau restaurateur y apparaît avec son e-mail et son restaurant).
  - **À vérifier** : fiches complètes (SIRET vérifié, abonnement, justificatifs) qui attendent la relecture du Kbis
    avant la carte (`team_review_queue()`), la plus ancienne en haut : SIRET, raison sociale, NAF, lien vers l'Annuaire
    des entreprises, justificatifs à ouvrir (liens de 10 minutes). **Valider** (après confirmation : la fiche part sur
    la carte) ou **Refuser** avec un motif de 5 à 300 caractères, montré au restaurateur (motifs fréquents en un clic) ;
    `team_review_merchant(fiche, valider, motif)`. Mêmes boutons sur la fiche d'un restaurant en attente ; pastille
    dans la barre latérale et alerte dans « À surveiller ».
  - **Revenus** : encaissé (aujourd'hui, 7 derniers jours, ce mois comparé au même moment du mois dernier, mois
    dernier, année) par jour et par mois ; revenu récurrent HT (formule à l'année ramenée au mois) ; **prévision du
    mois prochain** : revenu récurrent payé − résiliations qui prennent effet + abonnements gratuits (démonstration)
    convertis au taux choisi (curseur, scénarios 25 à 100 %), et encaissements attendus (renouvellements + premiers
    paiements). Encaissé lu dans `billing_payments`, rempli par `whop-webhook` à chaque paiement Whop (relu chez Whop) ;
    tant que Whop n'est pas branché, un encart liste ce qu'il reste à faire.
  - **Utilisateurs**, **Restaurants** (entonnoir, à relancer, avis signalés avec « Garder » / « Supprimer »),
    **Fiches restaurants** (justificatifs à ouvrir, entreprise, responsable, abonnement, statistiques du restaurateur,
    avis), **Bugs** (erreurs vues sur les appareils, « Marquer corrigé », « Copier le résumé »), **Serveur** (quotas de
    l'offre gratuite, tâches planifiées, ménage, liens vers les journaux).
  - Migrations `20261120090000_team_dashboard_v2.sql`, `20261121090000_team_restaurants.sql`,
    `20261122090000_team_revenue.sql`, `20261123100000_team_merchant_accounts.sql` ; code dans
    `web/components/dashboard/`.
- Les visites ne sont comptées qu'avec l'accord « statistiques » des cookies (identifiant d'appareil tiré au hasard,
  13 mois).
- Ajouter un membre : Supabase › SQL Editor,
  `insert into team_admins (user_id) select id from auth.users where email = 'adresse@exemple.fr';`
  (retirer : `delete from team_admins where user_id = (select id from auth.users where email = '…');`).

## Référencement et partage des liens

- **Titre, description, aperçu des liens** (Facebook, WhatsApp, Instagram, X, iMessage…) : balises en tête de
  `index.html` et dans `web/app/layout.tsx`. Image d'aperçu : `og-image.jpg` (1200 × 630, 80 Ko), source
  `scripts/og-image.html`.
- **Logo et icônes** : logo source `scripts/logo-flashmiam.png` (800 × 800). Icônes tirées de ce logo : `favicon.ico`,
  `favicon-96.png`, `apple-touch-icon.png` (raccourci iPhone), `icon-192.png`, `icon-512.png`, `icon-1024.png` et `icon-maskable-*.png` (logo à 70 % au centre)
  (raccourci Android, déclarées dans `manifest.webmanifest`), plus `web/app/favicon.ico` et `web/app/apple-icon.png`
  (application). Après un changement d'icône, augmenter le numéro `?v=` (manifest, `index.html`, `404.html`) et changer `CACHE` dans `sw.js` : les icônes restent 7 jours dans le cache des téléphones, seule une nouvelle adresse force leur rechargement.
- **robots.txt, sitemap.xml, page 404** : écrits à la publication par `scripts/seo.mjs` (page 404 : `404.html`).
- **Adresse principale** : `https://flashmiam.fr` (14 novembre 2026 ; `flashmiam.com` et `www.flashmiam.fr` y renvoient,
  `pwa-nantes.vercel.app` reste en service). Pour une autre adresse : variables `SITE_URL` et `NEXT_PUBLIC_SITE_URL`
  dans Vercel › Settings › Environment Variables, puis republier. La copie GitHub Pages renvoie vers l'adresse principale.
- Après la mise en ligne : déclarer le sitemap dans Google Search Console (`https://…/sitemap.xml`) et tester
  l'aperçu d'un lien sur https://www.opengraph.xyz.

## Simulateur de téléphone

`https://flashmiam.fr/simulateur/` affiche le vrai site dans un cadre à la taille d'un écran de téléphone (iPhone 14,
iPhone 15 Pro Max, iPhone SE, Android), pour tout essayer depuis un ordinateur : c'est le site en ligne, avec ses
vrais comptes et ses vraies données. Pour cela, le site accepte d'être affiché dans un cadre **par lui-même
seulement** (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`) ; un autre site ne peut toujours pas
l'afficher. Le modèle choisi indique au site s'il est sur iPhone ou Android (`FLASHMIAM_SIM.platform`).

## Mesurer la fluidité sur un vrai téléphone

`https://flashmiam.fr/?mesure` ouvre le site avec un petit panneau de mesure (`mesure.js`, téléchargé seulement avec ce
lien). On fait 5 gestes (glisser la carte, zoomer à deux doigts, ouvrir une fiche, la fermer, ouvrir les offres) ; chaque
case se coche toute seule, puis « Voir le résultat » affiche, pour chaque geste, les images par seconde, la part
d'images en retard (saccades), la pire image et le temps de réaction au toucher, avec le modèle et le système du
téléphone. Rien n'est envoyé : capture d'écran ou bouton « Copier le résultat ». Les gestes de la mesure ne comptent pas
dans les statistiques des restaurants. Désactiver le mode Économie d'énergie avant (il limite l'écran à 30 images/s).

## Tester en local

La géolocalisation et la connexion exigent HTTPS ou `localhost` :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Les comptes et les données sont ceux du projet Supabase en ligne (aucune copie locale) ; les fonctions serveur
n'acceptent que les adresses du site (CORS), sauf dans une copie de test. Après toute modification d'un `<script>` de
`index.html`, recalculer la politique de sécurité : `node scripts/csp.mjs` (la publication le fait aussi d'elle-même ;
`node scripts/csp.mjs --check` vérifie qu'elle est à jour).

À la publication, `scripts/minify.mjs` allège la copie publiée de `index.html` (esbuild : environ 750 → 506 Ko, 159 → 120 Ko
compressés) ; le fichier du dépôt reste lisible et commenté. Photos des fiches et des stories envoyées en WebP (JPEG
si le navigateur ne sait pas l'encoder).

Contrôles : `cd web && npm run lint && npm run build` (application), `deno test supabase/functions/` (fonctions
serveur), `npm run db:test` (règles de la base, PostgreSQL local), `node scripts/check-live.mjs` (sites en ligne).
