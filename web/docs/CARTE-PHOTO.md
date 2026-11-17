# Carte lue sur photo

Le restaurateur remplit sa carte en photographiant celle de son restaurant, sans saisir chaque plat.

## Côté restaurateur

- Formulaire de la fiche › **La carte** › bouton **📷 Remplir avec une photo de ma carte** : 1 à 5 photos (appareil
  photo ou galerie), une par page.
- Les photos sont réduites sur le téléphone (2000 px au plus, JPEG) puis lues par Claude (Anthropic) : rubriques,
  noms, prix, détails. Les plats arrivent dans l'éditeur habituel ; **rien n'est publié avant « Enregistrer »**.
- Prix non lu avec certitude : case vide entourée d'orange (« Prix ? »), à compléter. Plusieurs tailles = un plat
  par prix (« Tacos M », « Tacos L »).
- Carte déjà remplie : choix entre remplacer les plats et ajouter à la suite.

## Règles (fonction serveur `menu-scan`)

| Règle | Détail |
|---|---|
| Qui | un compte connecté qui a une fiche restaurant |
| Photos | 1 à 5, JPEG/PNG/WebP, 2,2 Mo au plus chacune ; **jamais enregistrées** |
| Plafond | 15 lectures par 24 heures et par fiche (table `menu_scans`, comptage seul, effacé après 30 jours) |
| Résultat | 80 plats au plus, longueurs de la base (nom 60, rubrique 30, détail 120, prix 0 à 999,99 €) |
| Coût | environ 3 à 10 centimes par lecture (modèle `claude-opus-5-5`) |

## Mise en route

Secret **`ANTHROPIC_API_KEY`** à ajouter dans Supabase › Edge Functions › Secrets (clé créée sur
console.anthropic.com). Sans ce secret, le bouton répond « pas encore activée ».

Fichiers : `supabase/functions/menu-scan/` (`handler.ts` règles et tests, `extract.ts` appel à Claude),
migration `supabase/migrations/20261112090000_menu_scans.sql`, interface dans `index.html` (`scanMenuPhotos`).
