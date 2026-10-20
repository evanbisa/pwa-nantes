# Sécurité et mise en ligne : où on en est (19 octobre 2026)

> Mémo à relire quand on reprend « le sujet de la sécurité ».
> Tout ce qui est marqué ✅ est fait et vérifié ; la section « Ce qu'il te reste à faire » liste
> les seules actions qui ne peuvent pas être faites à ta place.

## Ce qui est fait ✅

### Base de données Supabase (projet « FlashMiam project », `fnypgfyxbyaqrnklhjxc`, région Stockholm, UE)
- Tables `profiles` (étudiants / restaurateurs), `merchants` (fiches publiques), `merchant_private` (SIRET),
  avec la **RLS activée sur toutes les tables** et des privilèges accordés explicitement.
  Migrations : `supabase/migrations/20261020090000_init.sql`, `…093000_hardening.sql`, `…100000_follows_stats.sql`, `…101000_visitors_tidy.sql`.
- Abonnements et statistiques (`follows`, `merchant_stats`, `merchant_visitors`) : un étudiant ne voit que ses propres
  abonnements ; un restaurateur ne voit que des **chiffres** (abonnés, vues, personnes, clics), jamais qui le suit
  ou le consulte. Les compteurs ne s'incrémentent que via `track_merchant_event` ; personne ne peut les modifier en direct.
- Mots de passe et e-mails : gérés par Supabase Auth (mots de passe hachés), jamais copiés dans nos tables.
- Le SIRET est dans une table à part : lisible par le seul restaurateur concerné, modifiable par le serveur seulement.
- Un restaurateur ne peut modifier que sa propre fiche ; il ne peut ni changer son SIRET, ni se déclarer vérifié,
  ni toucher la fiche d'un autre, ni republier une fiche suspendue.
- La base refuse de publier une fiche sans SIRET vérifié par le serveur ou incomplète
  (adresse dans la zone, description, 1 photo, 1 service).
- Analyse de sécurité de Supabase (Advisors) : **0 alerte**.
- 16 scénarios de sécurité rejoués sur la vraie base (transaction annulée, aucune donnée laissée),
  99 scénarios sur une base locale (`npm run db:test`).

### Stories et promotions (migration `20261021090000_stories_promotions.sql`, appliquée — 0 alerte de sécurité)
- Lecture publique (visiteurs compris) des seules stories non expirées et promotions en cours des fiches en ligne.
- Le restaurateur ne publie / supprime que sur sa fiche ; la base impose 24 h maximum par story,
  la fin des promos du jour (minuit) et de la semaine (dimanche soir), 10 stories et 6 promotions au plus.
- Photos : stockage `stories` (5 Mo, JPG/PNG/WebP), dépôt uniquement dans le dossier de sa propre fiche.

### Connexion avec Google (clients)
- Prototype : bouton Google (Google Identity Services) affiché dès que `CONFIG.googleClientId` est renseigné.
  Sans serveur, le jeton est contrôlé (destinataire, émetteur, expiration, e-mail vérifié) mais pas sa signature :
  ce sera fait par Supabase Auth (`signInWithIdToken`) dans la version en ligne.
- Un restaurateur ne peut pas se connecter avec Google (compte vérifié par SIRET et mot de passe).

### Fonction serveur `verify-siret` (Supabase Edge Function, déployée)
- Vérifie : restaurateur connecté, clé de contrôle du SIRET, existence dans le répertoire Sirene,
  établissement en activité, code NAF de restauration, SIRET pas déjà utilisé par un autre compte.
- Crée ensuite la fiche en brouillon et enregistre le SIRET vérifié.
- La clé secrète est fournie par Supabase à la fonction : elle n'est écrite dans aucun fichier.

### Vérifications automatiques (GitHub Actions, `verifications.yml`)
- Depuis Internet, comme un visiteur, sur le vrai projet : SIRET, profils, e-mails et mots de passe inaccessibles ;
  la fonction refuse les appels sans session ou avec une fausse identité ; contrôle Sirene réussi sur un vrai
  restaurant yonnais (« L'Incontournable Vendéen », NAF 56.10A, adresse dans la zone).
- Tourne aussi chaque lundi, ce qui garde le projet Supabase actif (pause après 7 jours sans activité en gratuit).

### Hébergement
- Publication automatique sur **Cloudflare Pages** prête (`cloudflare.yml`) → https://roche-street-food.pages.dev ;
  elle construit le site mais ne publie pas tant que l'accès Cloudflare n'est pas fourni (voir ci-dessous).
- **Vercel** (hébergeur choisi) prêt : `vercel.json` à la racine (site complet + application sous `/app/`) + `web/.env.production`
  (valeurs publiques uniquement). L'offre gratuite Hobby est **non commerciale** : OK pendant la phase de test,
  à remplacer (Vercel Pro ou Cloudflare) quand les abonnements des restaurateurs deviendront payants.
  La fonction `verify-siret` (déployée, version 2) accepte l'adresse `https://pwa-nantes-web.vercel.app`.
- En-têtes de sécurité (`public/_headers` pour Cloudflare, `vercel.json` pour Vercel) : HTTPS forcé, pas d'intégration dans une page tierce,
  localisation réservée au site.
- En attendant, l'application est en ligne sur https://evanbisa.github.io/pwa-nantes/app/
  (le prototype reste sur https://evanbisa.github.io/pwa-nantes/).

## Ce qu'il te reste à faire (une seule fois, ≈ 15 min)

### 1. Hébergement : Cloudflare **ou** Vercel (un seul des deux suffit)
**Vercel** (choisi ; aucun jeton à copier) : https://vercel.com/signup › *Continue with GitHub* ›
*Add New… › Project* › importer `evanbisa/pwa-nantes` › *Project Name* `pwa-nantes-web` › ne rien changer d'autre ›
*Deploy*. Puis, dans Supabase, *Site URL* = `https://pwa-nantes-web.vercel.app` et ajouter
`https://pwa-nantes-web.vercel.app/**` aux *Redirect URLs*.

**Cloudflare** :
1. Créer un compte gratuit sur https://dash.cloudflare.com.
2. Copier l'**Account ID** (*Workers & Pages*, colonne de droite).
3. *My Profile › API Tokens › Create Token › Create Custom Token* : permission **Account › Cloudflare Pages › Edit**
   → *Create* → copier le jeton (affiché une seule fois).
4. GitHub › `evanbisa/pwa-nantes` › *Settings › Secrets and variables › Actions › New repository secret* :
   `CLOUDFLARE_API_TOKEN` (le jeton) et `CLOUDFLARE_ACCOUNT_ID` (l'identifiant).
5. Prévenir Claude : il relance la publication et vérifie le site.

### 1 bis. Google (connexion des clients, gratuit)
1. https://console.cloud.google.com › créer un projet « Roche Street Food ».
2. *API et services › Écran de consentement OAuth* : type **Externe**, nom de l'application, e-mail d'assistance,
   puis **Publier l'application** (sinon seuls les comptes « testeurs » peuvent se connecter).
3. *API et services › Identifiants › Créer des identifiants › ID client OAuth* › type **Application Web** :
   - *Origines JavaScript autorisées* : `https://pwa-nantes-web.vercel.app` et `https://evanbisa.github.io` ;
   - *URI de redirection autorisés* : `https://fnypgfyxbyaqrnklhjxc.supabase.co/auth/v1/callback`.
4. Envoyer à Claude l'**ID client** (`…apps.googleusercontent.com`) : il est public, Claude l'ajoute au site.
5. Supabase › *Authentication › Sign In / Providers › Google* : activer, coller l'ID client **et le code secret
   du client** (le secret se colle uniquement dans Supabase, jamais dans la conversation ni dans le dépôt).

### 2. Supabase › Authentication (le connecteur n'a pas accès à ces réglages)
- *Sign In / Providers › Email* : activer **Confirm email** ; mot de passe de 8 caractères minimum avec
  minuscules, majuscules, chiffres et symboles.
- *URL Configuration* :
  - *Site URL* : `https://roche-street-food.pages.dev`
  - *Redirect URLs* : `https://roche-street-food.pages.dev/**`, `https://evanbisa.github.io/pwa-nantes/app/**`,
    `http://localhost:3000/**`
- *Emails › SMTP Settings* : brancher Gmail (mot de passe d'application) ou Brevo. Indispensable : sans cela,
  les e-mails de confirmation ne partent qu'aux membres de l'équipe Supabase.

Si `roche-street-food.pages.dev` est déjà pris chez Cloudflare, l'adresse aura un suffixe : reporter la bonne
adresse dans Supabase.

## Ensuite (prévu)
- Inscription et connexion avec Supabase Auth dans l'application Next.js.
- Lecture des vrais commerces en temps réel sur la carte, tuiles OpenStreetMap.
