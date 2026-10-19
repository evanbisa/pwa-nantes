# Roche Street Food — application Next.js

Version de production du prototype (`../index.html`) : **Next.js 16 (App Router) + Tailwind CSS 4 + Supabase + Stripe**,
déployée sur **Vercel**. Zone couverte : La Roche-sur-Yon et sa couronne.

## État de la migration

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Schéma Supabase (tables, RLS, stockage), carte Leaflet | ✅ fait |
| 2 | Supabase Auth (inscription étudiant / commerçant), lecture des fiches en direct | à faire |
| 3 | Fiche commerce (tiroir mobile / panneau ordinateur), carte du restaurant, offres | à faire |
| 4 | Onboarding commerçant 4 étapes : SIRET (Sirene), justificatifs, recadrage 16:9 | à faire |
| 5 | Abonnement Stripe (Checkout, portail, webhook) | à faire |

## Arborescence

```
web/
├─ app/
│  ├─ layout.tsx · globals.css · page.tsx        carte publique (accueil)
│  ├─ (auth)/connexion · inscription · auth/callback      ← étape 2
│  ├─ commerce/[id]/page.tsx                     fiche partageable (SEO)  ← étape 3
│  ├─ pro/                                       espace commerçant (protégé) ← étapes 4-5
│  │  ├─ onboarding/ · fiche/ · offres/ · page.tsx (tableau de bord, statistiques)
│  └─ api/
│     ├─ sirene/verify/route.ts                  vérification SIRET côté serveur
│     └─ stripe/checkout · portal · webhook/route.ts
├─ components/
│  ├─ map/        MapView (chargement client) · MerchantMap (Leaflet) · useGeolocation · merchant-map.css
│  ├─ home/       HomeMap (carte + filtres + aperçu, provisoire)
│  ├─ merchant/   MerchantSheet · MenuList · Gallery          ← étape 3
│  ├─ onboarding/ Stepper · StepAccount · StepVerify · StepPayment · StepListing · ImageCropper ← étape 4
│  └─ ui/
├─ lib/
│  ├─ geo/        config.ts (centre, limites, fonds de carte) · distance.ts (distance, itinéraire)
│  ├─ supabase/   client.ts · server.ts · admin.ts (service_role)  ← étape 2
│  ├─ sirene.ts · siret.ts · hours.ts · stripe.ts                  ← étapes 3-5
│  └─ demo-merchants.ts   commerces de démonstration (à retirer)
├─ types/         merchant.ts · database.ts (généré : supabase gen types)
├─ proxy.ts       rafraîchissement de session Supabase (Next 16 : « proxy » remplace « middleware ») ← étape 2
└─ supabase/
   ├─ migrations/20261019120000_init.sql
   └─ tests/rls/  stub.sql · tests.sql · run.sh   (50 scénarios de sécurité)
```

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés
npm run dev                  # http://localhost:3000
```

## Base de données (Supabase)

1. Créer le projet Supabase (région UE, ex. Paris `eu-west-3`).
2. Exécuter `supabase/migrations/20261019120000_init.sql` (SQL Editor, ou `supabase db push`).
3. Auth › Providers › Email : activer **Confirm email** (le lien de confirmation remplace EmailJS).
   Pour l'envoi, brancher un SMTP (Resend, Brevo… offres gratuites) : l'envoi intégré de Supabase est très limité.

### Sécurité, en bref
- **RLS sur les 5 tables.** Public : uniquement les fiches publiées, ouvertes et abonnées, et leurs offres actives.
- **Données sensibles à part** (`merchant_private` : SIRET, justificatifs, Stripe) : lisibles par le seul propriétaire,
  modifiables uniquement côté serveur (`service_role`). RLS filtre des lignes, pas des colonnes : c'est pourquoi
  ces colonnes ne sont pas dans `merchants`.
- **Publication contrôlée par la base** : SIRET vérifié + justificatifs + attestation + abonnement actif, sinon refus.
  Un impayé (webhook Stripe) retire automatiquement la fiche de la carte.
- **Statistiques** : vues et clics « Y aller » via `track_merchant_event()`, jamais d'écriture directe.
- **Stockage** : `merchant-photos` (public) et `merchant-documents` (privé), un dossier par utilisateur.

### Tester la migration sans Supabase
```bash
PGHOST=… PGPORT=… PGUSER=postgres sh supabase/tests/rls/run.sh
```

## Déployer sur Vercel
Importer le dépôt, **Root Directory = `web`**, renseigner les variables de `.env.example`, déployer.

## Fonds de carte
Par défaut CARTO (données © OpenStreetMap). Leur offre gratuite est limitée à un usage non commercial :
pour la mise en production payante, prendre une offre CARTO, MapTiler ou Stadia et renseigner
`NEXT_PUBLIC_MAP_TILES_DAY` / `NEXT_PUBLIC_MAP_TILES_NIGHT`.
