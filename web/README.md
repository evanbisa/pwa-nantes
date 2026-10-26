# FlashMiam — application Next.js

Version de production du prototype (`../index.html`) : **Next.js 16 + Supabase (Auth + base de données)**,
pensée pour démarrer à **0 €/mois** (Supabase Free, Cloudflare Pages, tuiles OpenStreetMap).
Zone couverte : La Roche-sur-Yon et sa couronne.

> 📌 Point d'étape sécurité / mise en ligne (ce qui est fait, ce qu'il reste à faire) : [`docs/SECURITE-ETAT.md`](docs/SECURITE-ETAT.md)

## Avancement

| Action | Contenu | État |
| --- | --- | --- |
| 1 | Script SQL sécurisé (`profiles`, `merchants`, RLS) + connexion du projet | ✅ appliqué sur le projet Supabase `fnypgfyxbyaqrnklhjxc` (0 alerte de sécurité) |
| 2 | Site relié à Supabase : comptes (clients sans code, restaurateurs avec code e-mail, Google), fiches, photos, justificatifs, abonnés, statistiques, stories, promotions | ✅ sur le site complet (`../index.html`) ; les codes des restaurateurs et « mot de passe oublié » attendent le SMTP (voir 3) |
| 3 | Carte : vrais commerces en temps réel, tuiles OpenStreetMap | à faire |
| 4 | Stories (24 h) et promotions des restaurateurs : tables `stories`, `promotions`, stockage `stories` | ✅ appliqué sur Supabase (99 scénarios de sécurité, 0 alerte) |
| 5 | Connexion « Continuer avec Google » (clients) | ✅ en ligne (vérifiée par Supabase Auth) |
| 8 | **Tenue sous forte affluence** : délais et nouvelles tentatives, plus de déconnexion sur une panne, copie locale des fiches, temps réel sans rafale (story publiée = 0 requête, relecture ciblée et étalée), actualisation incrémentale, index « en cours », MapLibre et polices servis par le site, service worker, états de chargement (squelettes, « Réessayer », « j'aime » instantanés) | ✅ sur le site complet ; migration `20261025090000_perf.sql` |
| 9 | **Inscription en questions** (une par écran : prénom, sexe, âge, e-mail, mot de passe), animée ; sexe et âge facultatifs, modifiables dans le profil ; « Votre public » (sexe, âge) dans les statistiques du restaurateur, à partir de 5 personnes | ✅ sur le site complet ; migration `20261026090000_demographics.sql` |
| 7 | **Espace restaurateur** (plein écran sur téléphone, grand panneau sur ordinateur ; onglets Accueil, Statistiques, Publier, Avis, Ma fiche) et **statistiques détaillées** : provenance des visites, heures, menu, photos, itinéraires, appels, partages, avis lus, lien Google, vues / « j'aime » / clics de chaque story, clics sur chaque offre, plats aimés, abonnés gagnés et perdus, clients qui reviennent ; comparaison avec la période précédente (7, 30 ou 90 jours) ; masquer temporairement sa fiche | ✅ sur le site complet (`../index.html`) ; migration `20261024090000_analytics.sql` |
| 6 | Avis (1 à 5 étoiles, réponse du restaurateur, signalement), notifications (promos et stories des restaurants suivis, avis, réponses), alertes push, recherche par plat avec budget, partage d'une fiche, « ferme bientôt » (contour orange moins d'une heure avant la fermeture), « Offres autour de moi » (de la plus proche à la plus lointaine) | ✅ sur le site complet (`../index.html`) ; migration `20261023090000_reviews_notifications.sql`, fonction `send-push` |

## Connecter le projet à Supabase (≈ 15 min)

### 1. Créer le projet (gratuit)
1. https://supabase.com › *New project* › offre **Free**.
2. Région : **West EU (Paris)**. Choisir un mot de passe de base de données fort (gestionnaire de mots de passe).

### 2. Créer les tables et la sécurité
1. *SQL Editor* › *New query* › coller et exécuter, dans l'ordre, chaque fichier de `supabase/migrations/`
   (tous les fichiers, dans l'ordre des noms). Déjà fait sur le projet actuel.
2. Vérifier dans *Table Editor* : `profiles`, `merchants`, `merchant_private` affichent le badge **RLS enabled**.

### 3. Régler l'authentification (*Authentication*)
- *Sign In / Providers › Email* : **Confirm email** activé.
- *Sign In / Providers › Email* : mot de passe de **8 caractères minimum**, exigences
  « minuscules, majuscules, chiffres et symboles » (même règle que le prototype).
- *URL Configuration* : *Site URL* = `https://roche-street-food.pages.dev` ;
  *Redirect URLs* : `https://roche-street-food.pages.dev/**`, `https://evanbisa.github.io/pwa-nantes/app/**` et `http://localhost:3000/**`.
- *Emails › SMTP Settings* : **indispensable pour les restaurateurs et « mot de passe oublié »** (les clients
  s'inscrivent sans code). Sans SMTP personnalisé, Supabase n'envoie les e-mails qu'aux membres de l'équipe du
  projet, avec une limite très basse.
  Option à 0 € : **Gmail** (`smtp.gmail.com`, port 587, un « mot de passe d'application » Google,
  jusqu'à 500 e-mails/jour) ou **Brevo** (offre gratuite, 300 e-mails/jour).
- *Emails › Templates* (« Confirm signup » pour les restaurateurs, « Reset password ») : le site demande un **code à 6 chiffres**.
  Ajouter `{{ .Token }}` dans chaque modèle, par exemple « Votre code FlashMiam : {{ .Token }} ».

### 4. Récupérer les clés (*Project Settings › API Keys*)
| Variable | Où la trouver | Exposée au navigateur ? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | *Project URL* | oui (normal) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé **publishable** (`sb_publishable_…`, ou l'ancienne clé `anon`) | oui (normal, protégée par la RLS) |
| clé **secret** | (`sb_secret_…`, ou l'ancienne `service_role`) | **jamais** : n'est utilisée par aucun fichier de ce dépôt. Les traitements serveur (vérification du SIRET) passeront par une *Edge Function* Supabase, qui y a accès sans qu'on la recopie nulle part. |

### 5. Brancher l'application
```bash
cd web
npm install
cp .env.example .env.local   # coller les 2 valeurs publiques
npm run db:check             # vérifie la connexion ET ce qu'un visiteur anonyme peut lire
npm run dev                  # http://localhost:3000
```
`npm run db:check` doit afficher « Tout est en ordre ✔ » : fiches publiques lisibles ; SIRET, profils,
e-mails et mots de passe inaccessibles ; aucune écriture anonyme. Il refuse de tourner si une clé secrète
a été mise par erreur dans la variable publique.

### 6. Mise en ligne : Cloudflare Pages (gratuit, usage commercial autorisé)
Le site est **100 % statique** (`output: "export"`) : inscription, connexion et données passent par Supabase
depuis le navigateur, protégées par la RLS. Le workflow `.github/workflows/cloudflare.yml` contrôle le code,
construit le site et le publie sur **https://roche-street-food.pages.dev** à chaque `git push`.

À faire une seule fois (le workflow attend ces deux secrets ; sans eux il construit sans publier) :
1. Créer un compte gratuit sur https://dash.cloudflare.com.
2. *Account ID* : dans *Workers & Pages*, colonne de droite (ou dans l'URL du tableau de bord) → le copier.
3. *My Profile › API Tokens › Create Token › Create Custom Token* : permission **Account › Cloudflare Pages › Edit**,
   ressource : votre compte → *Create* → copier le jeton (affiché une seule fois).
4. GitHub › dépôt `evanbisa/pwa-nantes` › *Settings › Secrets and variables › Actions › New repository secret* :
   `CLOUDFLARE_API_TOKEN` (le jeton) et `CLOUDFLARE_ACCOUNT_ID` (l'identifiant).
5. Le prochain `git push` (ou *Actions › Publier sur Cloudflare Pages › Run workflow*) publie le site.

### 6 bis. Autre hébergeur possible : Vercel (offre Hobby gratuite)
⚠️ L'offre gratuite **Hobby** de Vercel est réservée à un **usage non commercial**. Elle convient tant que le site est
en test (paiement en mode démonstration). Dès que les restaurateurs paieront un abonnement, il faudra passer à
l'offre Pro de Vercel (payante) ou utiliser Cloudflare Pages (gratuit, usage commercial autorisé, voir ci-dessus).

Tout est prêt dans le dépôt : `vercel.json` (à la racine) et `scripts/build-vercel.sh` publient le **site complet**
à la racine (`/`) et la nouvelle application Next.js sous `/app/`, avec les en-têtes de sécurité ;
`web/.env.production` contient les deux valeurs publiques de Supabase. **Aucune variable ni aucun réglage à saisir.**
1. https://vercel.com/signup › *Continue with GitHub* (offre **Hobby**).
2. *Add New… › Project* › importer `evanbisa/pwa-nantes` (autoriser l'accès au dépôt si Vercel le demande).
3. *Project Name* : `pwa-nantes` (proposé par Vercel) → adresse `https://pwa-nantes.vercel.app`.
   Ne rien changer d'autre (*Root Directory* `./`, *Framework Preset* « Other » : tout est lu dans `vercel.json`).
4. *Deploy*. Ensuite, chaque `git push` sur la branche par défaut republie le site automatiquement
   (la branche `gh-pages` est ignorée).
5. Supabase › *Authentication › URL Configuration* : *Site URL* `https://pwa-nantes.vercel.app`,
   *Redirect URLs* : ajouter `https://pwa-nantes.vercel.app/**`.

En attendant, la même application est aussi publiée sur https://evanbisa.github.io/pwa-nantes/app/
(le prototype reste sur https://evanbisa.github.io/pwa-nantes/).

### Paiement des abonnements : Whop (whop.com)
Trois formules pour les restaurateurs : **Essentiel** (29 € HT/mois ou 290 € HT/an), **Premium** (79 € HT/mois ou
790 € HT/an) et **Sur devis** (contact par e-mail). Prix dans la table `billing_plans` (affichés par le site),
avantages de chaque formule dans `CONFIG.plans` (`index.html`), textes des CGV dans `lib/legal/site.ts` : les trois à
garder identiques.
- `whop-billing` (fonction serveur) : ouvre la page de paiement Whop de la formule choisie, résilie à l'échéance
  (jamais de coupure immédiate) ou annule une résiliation programmée.
- `whop-webhook` : reçoit les notifications de Whop (signature vérifiée, rejeu ignoré), relit l'abonnement chez Whop et
  l'enregistre. Abonnement terminé → fiche retirée de la carte ; paiement refusé → fiche maintenue, restaurateur prévenu.
- `delete-account` arrête le renouvellement Whop avant de supprimer un compte.
- Tant que `billing_settings.whop_live` est faux, le site reste en **mode démonstration** (aucun paiement).

Mise en service (une fois) :
1. Whop › créer l'entreprise, puis un produit « FlashMiam Pro » avec **4 tarifs** récurrents en euros : Essentiel mensuel
   (29 €), Essentiel annuel (290 €), Premium mensuel (79 €), Premium annuel (790 €). Noter leurs identifiants `plan_…`
   et celui de l'entreprise `biz_…` (publics, à me transmettre).
2. Whop › *Developer* › **clé d'API** de l'entreprise (droits : paiements/abonnements en lecture, gestion des membres,
   création de paiements). Supabase › *Edge Functions › Secrets* : `WHOP_API_KEY` = cette clé (à coller seulement là).
3. Whop › *Developer › Webhooks* : adresse `https://fnypgfyxbyaqrnklhjxc.supabase.co/functions/v1/whop-webhook`,
   événements `membership.*` et `payment.*`. Copier le secret affiché (`ws_…`) dans Supabase › *Edge Functions ›
   Secrets* : `WHOP_WEBHOOK_SECRET`.
4. Renseigner les identifiants `plan_…` dans `billing_plans.whop_plan_id` et `biz_…` dans
   `billing_settings.whop_account_id`, puis passer `billing_settings.whop_live` à vrai : le paiement est ouvert.

### Pages juridiques (`app/legal/`)
Mentions légales, CGU, CGV et politique de confidentialité, publiées sous `/app/legal/` (le site complet y renvoie).
Textes dans `lib/legal/` (un fichier par document) ; **informations à compléter dans `lib/legal/site.ts`** (surlignées
sur les pages tant qu'elles sont entre crochets). Composants dans `components/legal/` : barre latérale ou onglets,
sommaire qui suit la lecture, mode jour / nuit partagé avec la carte, impression.

### 7. Fonction serveur « verify-siret » (Supabase Edge Function, déjà déployée)
`supabase/functions/verify-siret/` : vérifie le SIRET d'un restaurateur connecté (clé de contrôle, répertoire Sirene,
établissement en activité, code NAF de restauration, SIRET non déjà pris), puis crée sa fiche en brouillon et
enregistre le SIRET vérifié. La clé secrète est fournie par Supabase à la fonction : elle n'est écrite nulle part.
Appel depuis le site : `supabase.functions.invoke("verify-siret", { body: { siret } })`.
Tests : `deno test supabase/functions/` (sans réseau).
SIRET de test `999 999 999 00009` : établissement fictif accepté sans appel à Sirene (fiche marquée « de test »).
Pour le refuser avant l'ouverture au public : secret `ALLOW_TEST_SIRET=false` (*Edge Functions › Secrets*).

`supabase/functions/client-signup/` (déployée) : inscription d'un client **sans code** ; vérifie l'adresse (format, domaine
qui reçoit des e-mails, via DNS), le mot de passe, le prénom, l'âge, puis crée le compte client déjà confirmé.
Plafonds : 30 inscriptions par heure et par connexion, 500 au total (table `signup_attempts`, empreinte de l'IP).

`supabase/functions/delete-account/` (déployée) : « Supprimer mon compte » ; efface les fichiers de la fiche
(photos, stories, justificatifs) puis le compte, et tout ce qui lui est lié en cascade.

`supabase/functions/send-push/` (déployée) : alertes push (standard Web Push : chiffrement RFC 8291, VAPID RFC 8292,
WebCrypto seulement). Elle ne fait que transmettre les notifications que la base vient de créer, réservées une par une
(`claim_pending_pushes`), à leurs seuls destinataires : aucun secret partagé n'est nécessaire. Les clés VAPID sont créées
au premier appel et gardées dans `push_config` (serveur uniquement). Seuls les services d'alertes des navigateurs
(Google, Mozilla, Apple, Microsoft) sont appelés. Le site l'appelle après chaque promo, story, avis ou réponse.
Le service worker `../sw.js` affiche les alertes et ouvre la bonne fiche au clic.

### 8. Vérifications automatiques en ligne
`.github/workflows/verifications.yml` (à chaque modification de `supabase/`, et chaque lundi) : depuis Internet,
comme un visiteur, contrôle que SIRET / profils / e-mails restent inaccessibles, que la fonction refuse les appels
sans session, et que l'analyse Sirene fonctionne sur un vrai restaurant yonnais. Le passage hebdomadaire garde
aussi le projet Supabase actif (l'offre gratuite le met en pause après 7 jours sans activité).

## Sécurité des données

| Donnée | Où | Qui peut la lire | Qui peut la modifier |
| --- | --- | --- | --- |
| Mot de passe | `auth.users` (Supabase Auth, haché en bcrypt) | personne | l'utilisateur, via Supabase Auth |
| E-mail | `auth.users` (schéma non exposé par l'API) | personne côté navigateur | l'utilisateur, via Supabase Auth |
| Prénom, nom, téléphone | `profiles` | son propriétaire | son propriétaire (pas le rôle) |
| Sexe, année de naissance (facultatifs) | `profiles` | son propriétaire ; les restaurateurs n'ont que des totaux, à partir de 5 personnes | son propriétaire |
| Fiche : nom, catégorie, menu, horaires, statut… | `merchants` | **tout le monde**, si publiée et ouverte | son propriétaire |
| SIRET, raison sociale | `merchant_private` | son propriétaire | le serveur uniquement (clé secrète) |
| Abonnement du restaurateur (formule, période, échéance) | `merchant_subscriptions` | le restaurateur | le serveur (fonctions `whop-billing` et `whop-webhook`, d'après Whop) ; le restaurateur seulement en mode « démonstration », tant que le paiement Whop est fermé |
| Formules et prix | `billing_plans`, `billing_settings` | **tout le monde** (prix, paiement ouvert ou non) ; identifiants Whop : le serveur seulement | le serveur / l'équipe (tableau de bord) |
| Photos de la fiche | stockage `photos` (public) | **tout le monde** | le restaurateur, dans le dossier de sa fiche |
| Justificatifs (Kbis, hygiène…) | stockage `documents` (privé) | le restaurateur seulement | le restaurateur, dans le dossier de sa fiche |
| Avis (note, commentaire, prénom + initiale) | `reviews` | **tout le monde**, si la fiche est en ligne ; l'identifiant du compte de l'auteur n'est lisible par personne (chacun retrouve les siens avec `my_reviews`) | le client : le sien (un par restaurant) ; le restaurateur : réponse et signalement sur sa fiche, jamais la note |
| Notifications | `notifications` | leur destinataire | créées par la base uniquement (déclencheurs) ; le destinataire les marque lues ou les efface |
| Appareils abonnés aux alertes | `push_subscriptions` | leur propriétaire | enregistrement par `register_push_subscription` ; lus par le serveur pour envoyer les alertes |
| Clés du serveur d'alertes | `push_config` | personne (serveur uniquement) | la fonction `send-push` |
| Stories, promotions | `stories`, `promotions` (+ stockage `stories`) | **tout le monde**, tant qu'elles sont en cours, si la fiche est en ligne | le restaurateur, sur sa fiche uniquement (durée de 24 h et fin des promos du jour / de la semaine imposées par la base) |
| Restaurants suivis | `follows` | l'étudiant concerné (le restaurateur ne voit que le **nombre**) | l'étudiant (s'abonner / se désabonner) |
| Statistiques (vues, personnes, clics) | `merchant_stats`, `merchant_visitors` | le restaurateur, en **chiffres** uniquement | personne en direct : fonction `track_visit` (comptes connectés seulement, 50 actions au plus par personne, fiche et jour : table `visit_budget`, illisible) |
| Statistiques détaillées (provenance, heures, partages, stories vues, clics sur les offres, désabonnements) | `merchant_event_visitors`, `merchant_view_hours`, `story_viewers`, `promo_clicks` | **personne** en direct : le restaurateur reçoit des **totaux** par `my_merchant_analytics` | fonction `track_visit` (et déclencheur de désabonnement) ; effacées après 90 jours |
| « J'aime » des stories et des plats | `story_likes`, `dish_likes` | chacun ses propres « j'aime » ; totaux par `dish_like_counts` (public) et `my_merchant_analytics` (restaurateur) | `toggle_story_like`, `toggle_dish_like` (story en ligne / plat de la carte, jamais sur sa propre fiche) |

- **RLS activée sur toutes les tables**, privilèges accordés explicitement, colonne par colonne pour les modifications.
- Le SIRET n'est pas dans `merchants` : la RLS filtre des lignes, pas des colonnes.
- Une fiche ne peut être publiée qu'avec un **SIRET vérifié par le serveur**, l'attestation sur l'honneur,
  un abonnement actif et une fiche complète
  (adresse dans la zone, description, 1 photo, 1 service) : c'est la base qui refuse, pas l'interface.
- Un restaurateur ne peut ni changer le propriétaire d'une fiche, ni son SIRET, ni se déclarer vérifié,
  ni toucher la fiche d'un autre, ni republier une fiche suspendue.
- Photos d'une fiche : uniquement des fichiers du stockage FlashMiam, dans le dossier de cette fiche (aucune adresse vers un site tiers).
- **Ménage chaque nuit** (fonction `purge`, lancée par `pg_cron`) : notifications après 60 jours, données par personne
  des statistiques après 90 jours, totaux après 180 jours, stories 30 jours après leur fin (avec leur photo).
- **Politique de sécurité du contenu (CSP)** dans les pages : scripts autorisés par empreinte (`scripts/csp.mjs`,
  recalculée à chaque publication), connexions limitées à Supabase, aux tuiles et à Google (connexion).
- Tests : `npm run db:test` (243 scénarios sur un PostgreSQL local : `PGHOST=… PGPORT=… PGUSER=postgres`) ;
  `deno test supabase/functions/` (fonctions serveur) ; `node scripts/check-supabase.mjs` et
  `node scripts/check-live.mjs` (projet et sites en ligne, aussi chaque lundi par `verifications.yml`).

## Limites des offres gratuites à connaître
- **Supabase Free** : 500 Mo de base, 50 000 utilisateurs actifs/mois, 1 Go de fichiers, 200 connexions temps
  réel simultanées. Le projet est **mis en pause après 7 jours sans activité** (réactivation en un clic) ;
  pas de sauvegardes automatiques téléchargeables : exporter la base régulièrement.
- **Cloudflare Pages** : gratuit, usage commercial autorisé, bande passante illimitée, 500 publications/mois.
- **Supabase Edge Functions** (pour la vérification du SIRET) : 500 000 appels/mois gratuits.
- **Tuiles OpenStreetMap** : gratuites avec attribution, pour un trafic modéré (politique d'usage OSM).

## Arborescence
```
web/
├─ app/                 layout · page (carte)
├─ components/map/      MapView (chargement navigateur) · MerchantMap (Leaflet) · useGeolocation
├─ components/home/     HomeMap (carte + filtres + aperçu)
├─ lib/supabase/        client.ts (navigateur) · env.ts
├─ lib/geo/             centre, limites, fonds de carte, distance
├─ types/               database.ts (à régénérer : npx supabase gen types) · merchant.ts
├─ scripts/             check-supabase.mjs · check-live.mjs
├─ public/_headers      en-têtes de sécurité (Cloudflare Pages)
└─ supabase/            migrations/ (init, hardening, follows_stats, visitors_tidy, stories_promotions) · functions/verify-siret/ · tests/ (rls, smoke.ts)
```
