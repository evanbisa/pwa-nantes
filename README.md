# Roche Street Food

Carte interactive (PWA) des food-trucks, kebabs, burgers et douceurs de La Roche-sur-Yon.

**Site en ligne : https://evanbisa.github.io/pwa-nantes/**

Tout le site tient dans un seul fichier : `index.html`.

## Fonctionnalités

- Création de compte (prénom, e-mail, mot de passe) à la première visite — mot de passe d'au moins 8 caractères avec
  une majuscule, une minuscule, un chiffre et un caractère spécial (règles cochées en direct pendant la saisie) — écran de connexion ensuite, option « Rester connecté », déconnexion.
- Demande de la localisation juste après l'inscription ; si elle est refusée, le bouton en haut à droite la redemande.
- Carte Google Maps (avec une clé API, voir ci-dessous), à plat (sans 3D), en mode jour ou nuit.
- Mise en page adaptée : téléphone (filtres en bas, fiches qui montent du bas) et ordinateur (panneau latéral avec recherche et liste).
- Espace restaurateur : choix « Client / Restaurateur » à l'inscription et à la connexion, puis inscription en 4 étapes (voir ci-dessous).

## Inscription des restaurateurs

1. **Compte** : prénom, nom, e-mail et téléphone professionnels, mot de passe.
2. **Vérification** :
   - le numéro **SIRET** est contrôlé (clé de contrôle), puis interrogé dans le répertoire officiel **Sirene de l'INSEE**
     via l'API publique [Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr) : l'établissement doit exister,
     être **en activité** et avoir un **code NAF de restauration** (56.10A/B/C, 56.21Z, 56.30Z, 10.71C/D, 10.52Z, 47.24Z, 47.81Z) ;
   - justificatifs : **Kbis** (ou avis de situation Sirene / extrait D1) et **attestation de formation à l'hygiène alimentaire (HACCP)**
     obligatoires ; récépissé de déclaration DDPP et licence facultatifs ;
   - attestation sur l'honneur.
3. **Paiement de l'abonnement** (voir ci-dessous).
4. **Fiche restaurant** : nom, catégorie, description, 1 à 10 photos au **format unique 16:9** (une photo d'un autre format
   s'ouvre dans un outil de recadrage : glisser pour déplacer, curseur, molette ou pincement pour zoomer ; export JPEG
   jusqu'à 1600 × 900), adresse (suggestions de la Base Adresse Nationale via la
   [Géoplateforme de l'IGN](https://data.geopf.fr/geocodage/search)), horaires, offre du moment, téléphone,
   **la carte** (facultative : plats, prix et détail, classés par rubrique ; jusqu'à 80 plats) → publication sur la carte.
   Les clients voient la carte dans la fiche du restaurant, et la recherche trouve aussi les plats.

Le restaurateur retrouve ensuite son espace dans le profil (statut, SIRET, abonnement, « Modifier ma fiche »).
Une inscription interrompue (« Terminer plus tard ») reprend à la bonne étape à la connexion suivante.

### Régler l'abonnement

Dans `index.html`, section « 1. CONFIGURATION », objet `proPlan` :

- `amount` : montant en euros (`null` affiche « Montant à définir ») ; `period` : `'mois'`, `'an'`…
- `stripePaymentLink` : lien de paiement [Stripe Payment Links](https://stripe.com/fr/payments/payment-links).
  Vide = **mode démonstration** (aucun paiement réel, clairement signalé). Dans Stripe, réglez la redirection après paiement sur
  `https://evanbisa.github.io/pwa-nantes/?paiement=ok`.
  ⚠️ Pour un vrai paiement, la confirmation doit être vérifiée par un serveur (webhook Stripe) : sans serveur, le retour
  `?paiement=ok` ne peut pas être authentifié.

### Limites actuelles (pas de serveur)

- Les justificatifs sont conservés sur l'appareil du restaurateur ; **aucun contrôle humain** n'est possible tant qu'il n'y a pas
  de base de données partagée.
- Un restaurant publié n'est **visible que sur l'appareil où il a été créé**. Pour qu'il apparaisse chez tous les utilisateurs,
  il faut une base de données en ligne (Firebase, Supabase…) — c'est la prochaine étape indispensable.

## Vérification de l'adresse e-mail (code à 6 chiffres)

**Réservée aux restaurateurs, une seule fois, à l'inscription** : un code à 6 chiffres est envoyé à l'adresse e-mail et
le compte n'est créé qu'une fois le bon code saisi. Les connexions suivantes se font avec le mot de passe seul.
Les **clients ne reçoivent aucun code** : un seul e-mail par restaurateur, le quota gratuit d'EmailJS reste donc
largement suffisant.
Code valable 10 minutes, 5 essais au maximum, renvoi possible après 60 secondes, 5 codes au plus par adresse et par quart d'heure.
Les comptes restaurateurs créés avant cette fonction doivent vérifier leur adresse à leur prochaine ouverture.

Tant que l'envoi n'est pas configuré, le site fonctionne en **mode démonstration** : le code est affiché à l'écran (clairement signalé).

### Activer l'envoi des e-mails avec EmailJS (gratuit jusqu'à 200 e-mails/mois)

1. Créez un compte sur https://www.emailjs.com/.
2. **Email Services** › *Add New Service* › Gmail (ou votre messagerie) › connectez l'adresse d'expédition. Notez le **Service ID**.
3. **Email Templates** › *Create New Template* :
   - *To Email* : `{{to_email}}`
   - *Subject* : `{{code}} est votre code Roche Street Food`
   - *Content* :
     ```
     Bonjour {{to_name}},

     Voici votre code pour {{purpose}} : {{code}}
     Il est valable {{validity}}.

     Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.
     {{site_name}} — {{site_url}}
     ```
   Notez le **Template ID**.
4. **Account** › *General* : copiez la **Public Key**.
5. Dans `index.html`, section « 1. CONFIGURATION », renseignez `email: { … publicKey, serviceId, templateId }`, puis poussez :
   le site est republié automatiquement.

⚠️ Sans serveur, le code est généré et contrôlé dans le navigateur : la vérification prouve qu'un utilisateur honnête possède
bien son adresse, mais une personne techniquement avertie pourrait la contourner. Pour une vérification inviolable, il faudra
la confier à un serveur (par exemple Supabase Auth ou Firebase Authentication), en même temps que la base de données partagée.

## Style de la carte

La carte (MapLibre, tuiles OpenFreeMap) a quatre styles, tous dessinés par le site lui-même (aucune clé, aucun service
en plus) :

| Valeur | Style | Jour / nuit |
|---|---|---|
| `google` (par défaut) | rendu Google Maps | suit le mode jour ou nuit |
| `neon` | **Nuit néon** : fond presque noir, grands axes violets et bleus lumineux | toujours sombre |
| `pastel` | **Minimaliste pastel** : fond crème, routes blanches, parcs vert menthe | toujours clair |
| `urbain` | **Urbain énergique** : grands axes corail et orange, eau bleu profond, parcs vert vif | toujours clair |

- **Essayer sans rien publier** : ajouter `?carte=neon` (ou `pastel`, `urbain`, `google`) à l'adresse du site,
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

## Activer la vraie carte Google Maps

Sans clé, le site affiche une carte de secours au style Google Maps (données OpenStreetMap).
Pour afficher Google Maps :

1. Ouvrez https://console.cloud.google.com/ et créez un projet (un compte de facturation est demandé ;
   l'usage d'un petit site reste dans les quotas gratuits de Google).
2. Menu « API et services » › « Bibliothèque » : activez **Maps JavaScript API**.
3. « API et services » › « Identifiants » › « Créer des identifiants » › **Clé API**.
4. Restreignez la clé : *Restrictions d'application* › **Sites web** › ajoutez `https://evanbisa.github.io/*`
   (et `http://localhost:*/*` pour tester en local) ; *Restrictions d'API* › Maps JavaScript API.
5. Dans `index.html`, collez la clé dans `googleMapsApiKey: ''` (section « 1. CONFIGURATION »), puis poussez.
   Le site est republié automatiquement sur GitHub Pages (workflow `.github/workflows/pages.yml`).

Si la clé est refusée, le site bascule tout seul sur la carte de secours.

## Comptes

Il n'y a pas de serveur : les comptes sont enregistrés dans le navigateur de l'appareil
(mot de passe dérivé avec PBKDF2-SHA-256, jamais stocké en clair). Un compte créé sur le téléphone
n'existe donc pas sur l'ordinateur. Pour des comptes partagés entre appareils, il faudra un service
d'authentification (Firebase Authentication, Supabase…).

## Tester en local

La géolocalisation et la création de compte exigent HTTPS ou `localhost` :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
