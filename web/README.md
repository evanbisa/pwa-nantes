# FlashMiam — application Next.js

Version de production du prototype (`../index.html`) : **Next.js 16 + Supabase (Auth + base de données)**,
pensée pour démarrer à **0 €/mois** (Supabase Free, Cloudflare Pages, tuiles OpenStreetMap).
Zone couverte : La Roche-sur-Yon et sa couronne.

> 📌 Point d'étape sécurité / mise en ligne (ce qui est fait, ce qu'il reste à faire) : [`docs/SECURITE-ETAT.md`](docs/SECURITE-ETAT.md)

## Avancement

| Action | Contenu | État |
| --- | --- | --- |
| 1 | Script SQL sécurisé (`profiles`, `merchants`, RLS) + connexion du projet | ✅ appliqué sur le projet Supabase `fnypgfyxbyaqrnklhjxc` (0 alerte de sécurité) |
| 2 | Supabase Auth : inscription / connexion (remplace le code local et EmailJS) | à faire |
| 3 | Carte : vrais commerces en temps réel, tuiles OpenStreetMap | à faire |
| 4 | Stories (24 h) et promotions des restaurateurs : tables `stories`, `promotions`, stockage `stories` | ✅ appliqué sur Supabase (99 scénarios de sécurité, 0 alerte) |
| 5 | Connexion « Continuer avec Google » (clients) | ✅ sur le prototype (identifiant Google à fournir) ; Supabase : fournisseur Google à activer |

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
- *Emails › SMTP Settings* : **indispensable pour de vrais utilisateurs**. Sans SMTP personnalisé, Supabase
  n'envoie les e-mails de confirmation qu'aux membres de l'équipe du projet, avec une limite très basse.
  Option à 0 € : **Gmail** (`smtp.gmail.com`, port 587, un « mot de passe d'application » Google,
  jusqu'à 500 e-mails/jour) ou **Brevo** (offre gratuite, 300 e-mails/jour).

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

### 7. Fonction serveur « verify-siret » (Supabase Edge Function, déjà déployée)
`supabase/functions/verify-siret/` : vérifie le SIRET d'un restaurateur connecté (clé de contrôle, répertoire Sirene,
établissement en activité, code NAF de restauration, SIRET non déjà pris), puis crée sa fiche en brouillon et
enregistre le SIRET vérifié. La clé secrète est fournie par Supabase à la fonction : elle n'est écrite nulle part.
Appel depuis le site : `supabase.functions.invoke("verify-siret", { body: { siret } })`.
Tests : `deno test supabase/functions/` (sans réseau).

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
| Fiche : nom, catégorie, menu, horaires, statut… | `merchants` | **tout le monde**, si publiée et ouverte | son propriétaire |
| SIRET, raison sociale | `merchant_private` | son propriétaire | le serveur uniquement (clé secrète) |
| Stories, promotions | `stories`, `promotions` (+ stockage `stories`) | **tout le monde**, tant qu'elles sont en cours, si la fiche est en ligne | le restaurateur, sur sa fiche uniquement (durée de 24 h et fin des promos du jour / de la semaine imposées par la base) |
| Restaurants suivis | `follows` | l'étudiant concerné (le restaurateur ne voit que le **nombre**) | l'étudiant (s'abonner / se désabonner) |
| Statistiques (vues, personnes, clics) | `merchant_stats`, `merchant_visitors` | le restaurateur, en **chiffres** uniquement | personne en direct : fonction `track_merchant_event` |

- **RLS activée sur toutes les tables**, privilèges accordés explicitement, colonne par colonne pour les modifications.
- Le SIRET n'est pas dans `merchants` : la RLS filtre des lignes, pas des colonnes.
- Une fiche ne peut être publiée qu'avec un **SIRET vérifié par le serveur** et une fiche complète
  (adresse dans la zone, description, 1 photo, 1 service) : c'est la base qui refuse, pas l'interface.
- Un restaurateur ne peut ni changer le propriétaire d'une fiche, ni son SIRET, ni se déclarer vérifié,
  ni toucher la fiche d'un autre, ni republier une fiche suspendue.
- Tests : `npm run db:test` (99 scénarios sur un PostgreSQL local : `PGHOST=… PGPORT=… PGUSER=postgres`).

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
├─ scripts/             check-supabase.mjs
├─ public/_headers      en-têtes de sécurité (Cloudflare Pages)
└─ supabase/            migrations/ (init, hardening, follows_stats, visitors_tidy, stories_promotions) · functions/verify-siret/ · tests/ (rls, smoke.ts)
```
