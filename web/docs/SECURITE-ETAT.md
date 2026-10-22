# Sécurité et mise en ligne : où on en est (22 octobre 2026)

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
  116 scénarios sur une base locale (`npm run db:test`).

### Stories et promotions (migration `20261021090000_stories_promotions.sql`, appliquée — 0 alerte de sécurité)
- Lecture publique (visiteurs compris) des seules stories non expirées et promotions en cours des fiches en ligne.
- Le restaurateur ne publie / supprime que sur sa fiche ; la base impose 24 h maximum par story,
  la fin des promos du jour (minuit) et de la semaine (dimanche soir), 10 stories et 6 promotions au plus.
- Photos : stockage `stories` (5 Mo, JPG/PNG/WebP), dépôt uniquement dans le dossier de sa propre fiche.

### Site relié à Supabase (migration `20261022090000_onboarding_storage.sql`, appliquée — 0 alerte de sécurité)
- Le site (`index.html`) n'enregistre plus rien sur l'appareil : comptes (Supabase Auth, code à 6 chiffres par e-mail),
  fiches, photos, justificatifs, abonnés, statistiques, stories et promotions sont partagés entre tous les appareils.
  Seuls la session de connexion et les préférences (thème, accord de localisation) restent dans le navigateur.
- Bibliothèque `supabase-js` 2.118.0 servie par le site lui-même (`vendor/`), sans dépendre d'un CDN.
- Inscription restaurateur : la base exige pour la mise en ligne un SIRET vérifié par le serveur, l'attestation sur
  l'honneur (`merchants.honor_at`) et un abonnement actif (`merchant_subscriptions`, mode « démonstration » seulement
  côté restaurateur ; le mode Stripe sera réservé au serveur).
- Stockage `photos` (public, 5 Mo, JPG/PNG/WebP) et `documents` (privé, 10 Mo, PDF/JPG/PNG) : chacun ne dépose, lit
  et supprime que dans le dossier de sa propre fiche ; personne d'autre ne voit les justificatifs.
- **SIRET de test** `999 999 999 00009` (établissement fictif, sans appel à Sirene) : fiche marquée « de test »
  (`merchants.is_test`, fixé par le serveur seulement). À désactiver avant l'ouverture au public : variable
  `ALLOW_TEST_SIRET=false` dans Supabase › *Edge Functions › Secrets*.
- Fonction `delete-account` (déployée) : « Supprimer mon compte » efface les fichiers de la fiche (photos, stories,
  justificatifs) puis le compte, et tout ce qui lui est lié en cascade.
- Tests : 116 scénarios de sécurité (`npm run db:test`) ; 12 tests des fonctions serveur ; 378 vérifications dans un
  navigateur sur une copie locale de Supabase (plusieurs « appareils » qui voient les mêmes données).

### Connexion avec Google (clients)
- Prototype : bouton Google (Google Identity Services) affiché dès que `CONFIG.googleClientId` est renseigné.
  Le jeton Google est vérifié par Supabase Auth (`signInWithIdToken`), signature comprise.
- Un restaurateur ne peut pas se connecter avec Google (compte vérifié par SIRET et mot de passe).

### Fonction serveur `verify-siret` (Supabase Edge Function, déployée — version 5)
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
  La fonction `verify-siret` (déployée) accepte l'adresse `https://pwa-nantes.vercel.app`.
- En-têtes de sécurité (`public/_headers` pour Cloudflare, `vercel.json` pour Vercel) : HTTPS forcé, pas d'intégration dans une page tierce,
  localisation réservée au site.
- En attendant, l'application est en ligne sur https://evanbisa.github.io/pwa-nantes/app/
  (le prototype reste sur https://evanbisa.github.io/pwa-nantes/).

## Mise en ligne : où on en est

### ✅ Fait (21 octobre 2026)
- **Vercel** : projet `pwa-nantes` → https://pwa-nantes.vercel.app (site complet ; application Next.js sous `/app/`).
- **Google** (projet Google Cloud « FlashMiam », compte flashmiampro@gmail.com) : écran de consentement « FlashMiam »
  publié, sans logo (évite la vérification de marque) ; client OAuth « FlashMiam - Site web », ID client
  `87416467106-adp7ojfn62mmkr1pmaa0mpna86drug86.apps.googleusercontent.com` (public) ajouté au site.
  Fournisseur Google activé dans Supabase (le code secret n'est enregistré que dans Supabase).
- Pages `confidentialite.html` et `conditions.html` (contact : flashmiampro@gmail.com).

### ⏳ Reste à faire
- **Bloquant pour l'inscription par e-mail** (la connexion Google, elle, fonctionne déjà) :
  - *Emails › SMTP Settings* : Gmail (mot de passe d'application de flashmiampro@gmail.com) ou Brevo. Sans cela,
    Supabase n'envoie les e-mails qu'aux membres de l'équipe du projet, et au plus quelques-uns par heure.
  - *Emails › Templates* « Confirm signup », « Magic link » et « Reset password » : le site demande un **code à 6 chiffres** ;
    ajouter `{{ .Token }}` dans le texte des modèles (les modèles par défaut ne contiennent qu'un lien).
- Supabase › *Authentication › URL Configuration* (n'a pas fonctionné la première fois, à refaire ensemble) :
  *Site URL* `https://pwa-nantes.vercel.app` ; *Redirect URLs* `https://pwa-nantes.vercel.app/**`,
  `https://evanbisa.github.io/pwa-nantes/**`, `http://localhost:3000/**`.
- Supabase › *Authentication › Sign In / Providers* : vérifier **Confirm email** (activé par défaut) et les règles
  de mot de passe (8 caractères, minuscules, majuscules, chiffres, symboles).
- *Emails › SMTP Settings* : Gmail (mot de passe d'application de flashmiampro@gmail.com) ou Brevo, avant l'ouverture
  au public (sinon les e-mails de confirmation ne partent qu'aux membres de l'équipe Supabase).
- Avant les premiers abonnements payants : statut (auto-entrepreneur ou société), page « Mentions légales »,
  passage à Vercel Pro ou à Cloudflare Pages (offre Hobby de Vercel = usage non commercial).

### Autre hébergeur possible : Cloudflare Pages (gratuit, usage commercial autorisé)
Workflow `cloudflare.yml` prêt : créer un compte, un jeton « Cloudflare Pages : Edit », puis ajouter les secrets
GitHub `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.

## Ensuite (prévu)
- Paiement réel des abonnements (Stripe), validé par le serveur.
- Désactiver le SIRET de test avant l'ouverture au public.
- Application Next.js (`/app/`) : reprendre les écrans du site, désormais reliés à Supabase.
