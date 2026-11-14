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
4. **Fiche restaurant** : nom, catégorie, description, 1 à 10 photos 16:9 (recadrage intégré), adresse (Base Adresse
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
  de l'équipe : visiteurs par jour, appareils, écran d'accueil, nouveaux comptes, restaurants, revenu mensuel,
  utilisation des fiches, audience. Périodes 7, 30 ou 90 jours.
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

Contrôles : `cd web && npm run lint && npm run build` (application), `deno test supabase/functions/` (fonctions
serveur), `npm run db:test` (règles de la base, PostgreSQL local), `node scripts/check-live.mjs` (sites en ligne).
