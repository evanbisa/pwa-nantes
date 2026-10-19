# Roche Street Food — application Next.js

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

## Connecter le projet à Supabase (≈ 15 min)

### 1. Créer le projet (gratuit)
1. https://supabase.com › *New project* › offre **Free**.
2. Région : **West EU (Paris)**. Choisir un mot de passe de base de données fort (gestionnaire de mots de passe).

### 2. Créer les tables et la sécurité
1. *SQL Editor* › *New query* › coller et exécuter, dans l'ordre, chaque fichier de `supabase/migrations/`
   (`…_init.sql`, `…_hardening.sql`, `…_follows_stats.sql`, `…_visitors_tidy.sql`). Déjà fait sur le projet actuel.
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
| Restaurants suivis | `follows` | l'étudiant concerné (le restaurateur ne voit que le **nombre**) | l'étudiant (s'abonner / se désabonner) |
| Statistiques (vues, personnes, clics) | `merchant_stats`, `merchant_visitors` | le restaurateur, en **chiffres** uniquement | personne en direct : fonction `track_merchant_event` |

- **RLS activée sur toutes les tables**, privilèges accordés explicitement, colonne par colonne pour les modifications.
- Le SIRET n'est pas dans `merchants` : la RLS filtre des lignes, pas des colonnes.
- Une fiche ne peut être publiée qu'avec un **SIRET vérifié par le serveur** et une fiche complète
  (adresse dans la zone, description, 1 photo, 1 service) : c'est la base qui refuse, pas l'interface.
- Un restaurateur ne peut ni changer le propriétaire d'une fiche, ni son SIRET, ni se déclarer vérifié,
  ni toucher la fiche d'un autre, ni republier une fiche suspendue.
- Tests : `npm run db:test` (69 scénarios sur un PostgreSQL local : `PGHOST=… PGPORT=… PGUSER=postgres`).

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
└─ supabase/            migrations/ (init, hardening, follows_stats, visitors_tidy) · functions/verify-siret/ · tests/ (rls, smoke.ts)
```
