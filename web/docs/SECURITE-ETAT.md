# Sécurité et mise en ligne : où on en est (24 octobre 2026)

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

### Avis, notifications, alertes push (migration `20261023090000_reviews_notifications.sql`)
- Avis : un par client et par restaurant en ligne ; nom affiché fixé par la base (« Léa M. », jamais l'e-mail) ;
  le restaurateur répond et signale, mais ne peut ni noter sa fiche, ni modifier ou supprimer un avis.
- Notifications créées uniquement par la base (promo ou story d'un restaurant suivi, nouvel avis, réponse) selon les
  réglages de chacun ; anti-rafale (10 promos par restaurant et par jour, 1 story toutes les 6 h) ; effacées après 60 jours.
- Alertes push : la fonction `send-push` ne transmet que des notifications existantes, récentes et pas encore envoyées
  (réservées une par une par la base), à leurs seuls destinataires — aucun secret partagé. Messages chiffrés de bout en
  bout (le service d'alertes du navigateur ne peut pas les lire) ; seuls les services d'alertes connus sont appelés
  (pas d'appel vers une adresse quelconque) ; un appareil désabonné est oublié ; déconnexion = appareil désabonné.
- Clés VAPID créées par la fonction et gardées dans `push_config` : aucune politique RLS, donc illisible depuis le site.
- Tests : 167 scénarios de sécurité ; 19 tests des fonctions serveur (dont le déchiffrement complet d'une alerte et la
  signature VAPID), chiffrement vérifié avec l'implémentation de référence `http_ece` ; 93 vérifications navigateur de
  plus (recherche, avis, notifications, alerte push reçue et déchiffrée, partage), en mode jour et en mode nuit.

### Espace restaurateur et statistiques détaillées (migration `20261024090000_analytics.sql`)
- Mesuré : d'où vient chaque visite (carte, liste, recherche, offres, story, notification, lien partagé), heure des vues,
  partages, onglet Avis, lien Google, vues / « j'aime » / clics de chaque story, clics sur chaque offre, « j'aime » des
  plats, désabonnements, clients qui reviennent.
- **Le restaurateur ne reçoit que des totaux** (`my_merchant_analytics`, sa fiche uniquement, 90 jours au plus) : les tables
  par personne (`merchant_event_visitors`, `merchant_view_hours`, `story_viewers`, `promo_clicks`) ont une règle
  « aucun accès direct » ; `story_likes` et `dish_likes` ne laissent lire à chacun que ses propres « j'aime ».
- Un seul point d'entrée pour le site, `track_visit` : liste fermée d'évènements et de provenances, fiche en ligne
  obligatoire, story / offre vérifiées comme appartenant à la fiche, visites du restaurateur sur sa fiche ignorées.
- « J'aime » : story encore en ligne ou plat présent sur la carte, jamais sur sa propre fiche, une fois par personne.
- Historique effacé après 90 jours ; stories gardées 30 jours après leur fin (visibles par leur seul restaurateur) pour
  leurs chiffres, puis supprimées avec leur photo. Pages Confidentialité mise à jour.
- Fiche « masquée temporairement » (`merchants.is_open`, déjà modifiable par son seul propriétaire) : invisible partout.
- **Entièrement en ligne** (23 octobre 2026) : les trois premiers morceaux appliqués par l'outil Supabase, le dernier
  (`track_visit` et « j'aime », `web/supabase/manual/analytics_4_tracking_likes.sql`) collé dans le SQL Editor.
  Vérifié : code identique à la version testée, droits conformes, 0 nouvelle alerte de sécurité ; contrôlé aussi
  chaque semaine par `verifications.yml` (fonctions présentes, réservées comme prévu, données par personne illisibles).
- Tests : 197 scénarios de sécurité ; 599 vérifications dans un navigateur (dont 70 pour l'espace restaurateur :
  chiffres exacts après les actions de trois clients, confidentialité, téléphone 320 px, ordinateur, et 5 pour le
  fonctionnement en attendant le dernier morceau).

### Cookies : choix au premier lancement (23 octobre 2026)
- Fenêtre « Vos choix de cookies » avant tout : « Tout refuser » et « Tout accepter » identiques, « Personnaliser »
  (statistiques de fréquentation, services Google ; tout est désactivé par défaut). Choix gardé 6 mois puis redemandé,
  modifiable dans Profil › Cookies.
- Sans accord : aucune statistique envoyée, script Google (connexion) non chargé, pas de carte Google Maps.
- Police Roboto servie par le site (`vendor/fonts`, licence OFL) : plus aucun appel à Google au chargement.
- Page Confidentialité : section « Cookies » réécrite ; statistiques fondées sur le consentement.
- Tests : 29 vérifications dans un navigateur (avant le choix, refus, accord après coup, choix de plus de 6 mois,
  clavier, téléphone 320 px, ordinateur).

### Forte affluence (23 octobre 2026)
- **Réseau** : délai maximal (15 s pour une lecture, 30 s pour une écriture), nouvelles tentatives des seules lectures
  (serveur saturé 429/5xx, réseau coupé), espacées au hasard ; les écritures ne sont jamais envoyées deux fois.
  Les tentatives intégrées à supabase-js sont coupées (`db.retry: false`) pour ne pas se multiplier.
  Bandeau d'état (connexion difficile, hors connexion, très demandé + « Réessayer »).
- **Plus de déconnexion sur une panne** : au démarrage, seule une session refusée par le serveur déconnecte ;
  serveur saturé = nouvelles tentatives puis écran « FlashMiam est très demandé » avec « Réessayer », session gardée.
- **Données** : plus d'effacement des promos/stories si une partie des lectures échoue ; réponses obsolètes ignorées ;
  copie locale des fiches publiques (carte affichée tout de suite, même serveur injoignable).
- **Anti-rafale** : une story ou promo publiée arrive avec le message du temps réel (0 requête) ; un autre changement
  ne fait relire que ce restaurant, après 0,5 à 3 s au hasard ; actualisation de secours incrémentale (≈ 8 fois moins
  de données) toutes les 4 à 6 min (2 min sans temps réel) ; onglet caché 3 min = connexion temps réel fermée ;
  serveur temps réel complet (≈ 200 connexions en offre gratuite) = pause de 10 min, relève régulière à la place ;
  notifications : en direct, relève de secours toutes les 5 min (1 min sans temps réel).
- **Base** (`20261025090000_perf.sql`, appliquée) : index sur la fin des stories et promotions, le site ne lit plus que
  celles en cours (17,7 ms → 3 ms par visiteur avec 30 jours d'historique, et ça ne grossit plus avec le temps).
- **Fichiers** : MapLibre et les polices servis par le site (plus de dépendance à unpkg ni à Google Fonts), MapLibre
  chargé en parallèle ; service worker : bibliothèques gardées sur l'appareil, page disponible hors connexion,
  Supabase et tuiles jamais interceptées (routage statique) ; en-têtes de cache sur Vercel.
- **Test de charge** (copie locale de 1,9 million de lignes, 300 visiteurs simultanés) : rafale « story publiée »
  1 200 requêtes / 3,5 s médiane → 0 requête ; fiche modifiée : 3 petites lectures de 3 ms ; 300 visites simultanées
  toutes comptées. 4G lente : visite suivante en 1,5 s (168 Ko) contre 5,3 s la première fois.
- Tests : 39 vérifications « forte affluence » (503, lenteur, hors connexion, temps réel simulé, cache, service worker,
  8 visiteurs en même temps).

### Inscription en questions, sexe et âge (24 octobre 2026, migration `20261026090000_demographics.sql`)
- Inscription d'un client en une question par écran (prénom, sexe, âge, e-mail, mot de passe + confirmation),
  avec progression, retour en arrière, clavier complet, brouillon de l'onglet (jamais le mot de passe) et confettis à l'arrivée.
  Un nouveau compte Google répond aux deux questions sexe et âge (l'âge peut être passé).
- `profiles.gender` (`female`, `male`, `other`, ou vide = « Je préfère ne pas le dire ») et `profiles.birth_year`
  (déduite de l'âge) : facultatifs, contrôlés par la base (liste fermée ; années absurdes ou moins de 15 ans ignorées à
  l'inscription), modifiables seulement par leur propriétaire (droit de mise à jour limité à ces colonnes), illisibles par les autres.
- 15 ans minimum (âge du consentement numérique en France), affiché dans les conditions d'utilisation.
- Restaurateur : « Votre public » = totaux par sexe et tranche d'âge des clients venus sur la période, renvoyés par
  la base **seulement à partir de 5 personnes** (sinon rien), sans aucun identifiant.
- Tests : 11 scénarios de sécurité ajoutés (208 au total) et 60 vérifications de bout en bout (inscription, profil, public).

### Revue de sécurité approfondie (24 octobre 2026)
Audit complet de la base en ligne (droits table par table et colonne par colonne, fonctions, stockage, temps réel,
durées de conservation), des fonctions serveur, du site (affichage de données, liens, scripts), du dépôt et des
publications. Corrigé :
- **Avis** : l'identifiant du compte de l'auteur n'est plus lisible par personne (il permettait de relier tous les avis
  d'une même personne) ; chacun retrouve les siens par `my_reviews()`. Les avis ne sont plus diffusés en temps réel
  (le site ne les écoutait pas, et chaque avis complet partait à quiconque s'abonnait).
- **Statistiques impossibles à gonfler** : un visiteur sans compte ne fait plus rien compter (avant, un script pouvait
  ajouter des millions de vues à un restaurant) ; au plus 50 actions comptées par personne, par fiche et par jour ;
  l'ancien compteur direct `track_merchant_event` est fermé.
- **Photos des fiches** : seulement des fichiers du stockage FlashMiam, dans le dossier de la fiche. Avant, une adresse
  vers un site tiers était acceptée : une « photo » pouvait servir à pister l'adresse IP de chaque visiteur.
- **Durées de conservation réellement appliquées** : la page Confidentialité annonçait 90 jours, mais les visites
  par personne n'étaient jamais effacées. Désormais, chaque nuit (2 h 17 UTC, `pg_cron` → fonction `purge`) :
  notifications après 60 jours, données par personne après 90 jours, totaux sans donnée personnelle après 180 jours,
  stories 30 jours après leur fin avec leur photo (retirée du stockage). Vérifié en ligne (réponse 200, 9 tables traitées).
- **Politique de sécurité du contenu (CSP)** sur toutes les pages : seuls les scripts du site, autorisés par leur
  empreinte, peuvent s'exécuter ; connexions limitées à Supabase, aux tuiles de la carte, au géocodage et à Google
  (connexion). Vérifié : un script injecté, un attribut `onerror` (XSS), un envoi de données vers un autre site, un pixel
  de pistage et `eval` sont bloqués. Recalculée automatiquement à chaque publication (`scripts/csp.mjs`).
  Google Maps (moteur de carte facultatif, inutilisé) n'est pas autorisé : sa liste de domaines affaiblirait la
  politique ; `csp.mjs` refuse de publier une page où une clé Google Maps serait ajoutée sans politique adaptée
  (sinon la carte MapLibre prend le relais, vérifié).
- **En-têtes** (Vercel, Cloudflare) : intégration dans un autre site interdite (`frame-ancestors 'none'`), fenêtres
  isolées (`Cross-Origin-Opener-Policy`), caméra, micro, paiement, USB et suivi publicitaire désactivés ;
  sur GitHub Pages (pas d'en-têtes possibles), la page refuse de s'afficher dans le cadre d'un autre site.
- **Publication** : actions GitHub épinglées sur une version exacte (empreinte), `wrangler` épinglé, jeton GitHub non
  conservé après la copie du dépôt ; 0 dépendance vulnérable (`npm audit`) ; aucun secret dans le dépôt ni son historique.
- **Vérifications automatiques en ligne** (`verifications.yml`, à chaque modification et chaque lundi) : en plus des
  droits d'un visiteur, `check-live.mjs` contrôle les sites publiés (aucune clé secrète dans les pages et scripts,
  CSP active, en-têtes de sécurité).
- Déjà solides (vérifiés) : RLS sur toutes les tables, fonctions privilégiées isolées (`search_path` vide, droits
  explicites), stockage limité à son dossier (types et tailles imposés), garde-fous des fiches, avis et stories, aucune
  donnée d'utilisateur insérée comme HTML dans les pages (51 gabarits fixes, textes ajoutés en texte brut).

**Clés API** (inventaire) :
| Clé | Où | Risque |
| --- | --- | --- |
| Supabase *publishable* `sb_publishable_W-2G…` | site, workflows | publique par nature : ne donne que ce que la RLS autorise (234 scénarios + contrôle en ligne) |
| Supabase *secret* | uniquement dans Supabase (fonctions serveur) | jamais dans le dépôt ni les pages (vérifié, historique compris) |
| Anciennes clés `anon` / `service_role` (JWT) | Supabase, plus utilisées par le site | à désactiver (voir ci-dessous) |
| Identifiant client Google `87416467106-…` | site | public par nature ; protégé par les origines autorisées (Google Cloud) et la vérification du jeton par Supabase |
| Secret du client Google | uniquement dans Supabase | jamais dans le dépôt |
| Clés VAPID (alertes) | table `push_config` | privée illisible (aucune règle d'accès) ; la clé publique est donnée aux navigateurs, c'est normal |
| Jetons Cloudflare | secrets GitHub | jamais affichés par les workflows |

### Inscription des clients sans code (25 octobre 2026, migration `20261028090000_client_signup.sql`, fonction `client-signup`)
- Seuls les **restaurateurs** reçoivent un code par e-mail. Un client crée son compte sans code ; son adresse est
  vérifiée autrement, en trois temps :
  1. faute de frappe d'une messagerie connue repérée en direct (« lea@gmial.com » → « Vouliez-vous dire lea@gmail.com ? ») ;
  2. le serveur vérifie que le **domaine reçoit des e-mails** (enregistrements DNS : « flashmiam-introuvable.fr » ou un
     domaine qui refuse tout courrier sont refusés) — seul le domaine est transmis au service DNS (Cloudflare 1.1.1.1) ;
  3. écran **« C'est bien votre adresse ? »** : l'adresse en grand, domaine mis en avant, « Oui, c'est la bonne » /
     « Non, je la corrige ».
- La fonction serveur revérifie tout (adresse, mot de passe : mêmes règles que le site, prénom, sexe, âge ≥ 15 ans),
  crée le compte **toujours comme client** (impossible de créer un restaurateur ou un administrateur par ce chemin)
  et déjà confirmé ; le site se connecte ensuite avec le mot de passe choisi. « Confirm email » reste activé dans
  Supabase : l'inscription directe par l'API publique demande toujours un code.
- Contre les faux comptes en masse : 30 inscriptions par heure au plus depuis une même connexion (assez pour une salle
  de cours derrière le wifi du campus), 500 par heure au total ; adresse IP enregistrée sous forme d'empreinte
  seulement (HMAC), effacée au bout de 2 jours. À ajouter avant l'ouverture au public : CAPTCHA (Turnstile).
- Tests : 13 scénarios de la fonction, 9 de la base (plafond illisible et impossible à contourner), 18 de bout en bout.
  Vérifié en ligne : vrai DNS (domaine inexistant refusé, « univ-nantes.fr » accepté), trois adresses IP inventées
  (X-Forwarded-For) comptées comme une seule connexion, deux réseaux différents comptés séparément.

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
- **Sécurité (24 octobre 2026), à faire dans Supabase** :
  - *Project Settings › API Keys* : désactiver les **anciennes clés** (`anon`, `service_role`), plus utilisées par le site.
    La `service_role` ancienne ne peut pas être changée seule et reste valable jusqu'en 2107 : mieux vaut la couper.
    Dis-moi quand c'est fait : je vérifie tout de suite que le site et les fonctions marchent (réactivable en un clic).
  - *Authentication › Providers › Email* : longueur minimale 8 et caractères requis « minuscules, majuscules, chiffres
    et symboles » (le site l'impose déjà, la base le ferait aussi) ; **Email OTP Expiration** : 900 s (15 min) au lieu de 1 h ;
    vérifier que **Confirm email** est bien activé (c'est le réglage par défaut).
  - Protection contre les mots de passe divulgués (HaveIBeenPwned) : offre Pro de Supabase uniquement.
  - Avant l'ouverture au public : *Authentication › Attack Protection* → CAPTCHA (Cloudflare Turnstile, gratuit) contre
    les inscriptions en masse (il faudra me donner la clé du site Turnstile, publique, pour l'ajouter aux pages).
- **Vérification des restaurateurs** : le SIRET est contrôlé (existe, en activité, restauration), mais rien ne prouve
  que la personne est bien le gérant ; quelqu'un pourrait inscrire le restaurant d'un autre. Les justificatifs (Kbis)
  sont déposés mais pas relus : prévoir une relecture avant la mise en ligne (je peux ajouter l'état « en attente de
  validation » et un écran de modération).
- **E-mails des restaurateurs et « mot de passe oublié »** (les clients s'inscrivent sans code depuis le 25 octobre 2026) :
  - Sans serveur SMTP, Supabase **n'écrit qu'aux membres de l'équipe du projet** (erreur `email_address_not_authorized`,
    aucun compte créé) et au plus 2 e-mails par heure : un restaurateur ordinaire ne reçoit pas son code, et personne
    ne peut récupérer un mot de passe oublié. Le site affiche alors un message clair au lieu de l'erreur brute.
  - **À faire** : SMTP avec Gmail (gratuit, environ 500 e-mails par jour) :
    1. sur le compte Google flashmiampro@gmail.com, activer la validation en deux étapes, puis créer un
       **mot de passe d'application** (https://myaccount.google.com/apppasswords, nom « Supabase ») ;
    2. https://supabase.com/dashboard/project/fnypgfyxbyaqrnklhjxc/auth/smtp → *Enable Custom SMTP* : expéditeur
       `flashmiampro@gmail.com`, nom `FlashMiam`, hôte `smtp.gmail.com`, port `465`, identifiant
       `flashmiampro@gmail.com`, mot de passe = le mot de passe d'application (à coller seulement là, jamais ailleurs) ;
    3. https://supabase.com/dashboard/project/fnypgfyxbyaqrnklhjxc/auth/rate-limits : passer l'envoi d'e-mails de
       30 à 100 par heure (30 par heure est imposé juste après l'activation).
    Plus tard, avec un nom de domaine (ex. flashmiam.fr) : Brevo ou Resend, pour des e-mails qui arrivent plus sûrement.
  - *Emails › Templates* « Confirm signup », « Magic link » et « Reset password » : le site demande un **code à 6 chiffres** ;
    ajouter `{{ .Token }}` dans le texte des modèles (les modèles par défaut ne contiennent qu'un lien).
- Supabase › *Authentication › URL Configuration* (n'a pas fonctionné la première fois, à refaire ensemble) :
  *Site URL* `https://pwa-nantes.vercel.app` ; *Redirect URLs* `https://pwa-nantes.vercel.app/**`,
  `https://evanbisa.github.io/pwa-nantes/**`, `http://localhost:3000/**`.
- Avant les premiers abonnements payants : statut (auto-entrepreneur ou société), page « Mentions légales »,
  passage à Vercel Pro ou à Cloudflare Pages (offre Hobby de Vercel = usage non commercial).

### Autre hébergeur possible : Cloudflare Pages (gratuit, usage commercial autorisé)
Workflow `cloudflare.yml` prêt : créer un compte, un jeton « Cloudflare Pages : Edit », puis ajouter les secrets
GitHub `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.

## Ensuite (prévu)
- Paiement réel des abonnements (Stripe), validé par le serveur.
- Modération des avis signalés (pour l'instant : tableau de bord Supabase, table `reviews`, colonne `reported_at`).
- Désactiver le SIRET de test avant l'ouverture au public.
- Application Next.js (`/app/`) : reprendre les écrans du site, désormais reliés à Supabase.
