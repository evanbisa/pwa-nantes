# QR code de visite

Le client prouve qu'il est venu (et profite d'une offre) en montrant un QR code ; le restaurateur le scanne.

## Côté client

- Fiche d'un restaurant › **Valider ma visite** (bouton bleu sous les offres), ou **Utiliser** sur une offre en cours.
- QR code plein écran, propre à ce restaurant (et à cette offre) : **usage unique**, il **change chaque minute**
  (anneau qui se vide, « Nouveau QR code dans 42 s »). Sous le QR code, le même code en clair (`K7P4-QX9M-2T`) à dicter
  si la caméra du restaurateur ne le lit pas.
- L'écran reste allumé tant que le QR code est affiché. Dès le scan : « Visite validée ! », « 3e visite chez … ».

## Côté restaurateur

- Bouton **Scanner** en bas à droite de la carte, et grande carte **Scanner un client** en tête de son espace
  (avec le nombre de visites validées aujourd'hui).
- Caméra arrière plein écran : il suffit de viser, la lecture est automatique (vibration et petit son). Résultat :
  « Visite validée » ou « Offre validée » avec **l'offre à appliquer**, le numéro de la visite du client chez lui, et
  un avertissement si ce client a déjà eu cette offre aujourd'hui. Le scanner repasse tout seul au client suivant.
- Sans caméra (ordinateur, accès refusé) : saisie du code à la main, mise en forme automatique.
- Le QR code est aussi un lien (`…/#visite=CODE`) : lu avec l'appareil photo du téléphone, il ouvre directement le
  scanner FlashMiam du restaurateur (connecté) et valide la visite.

## Règles (vérifiées par la base, pas par le navigateur)

| Règle | Détail |
|---|---|
| Qui tire un QR code | un compte **client**, pour un restaurant **en ligne** ; l'offre doit être en cours et de ce restaurant |
| Durée | 75 s ; un nouveau QR code est tiré chaque minute, l'ancien cesse de valoir 10 s plus tard |
| Usage unique | un QR code validé (ou refusé comme doublon) ne sert plus jamais |
| Qui valide | **seul le propriétaire de la fiche** du restaurant pour lequel le QR code a été tiré |
| Doublon | même client, même offre (ou visite simple) validés il y a moins de 20 min : non compté une 2e fois |
| Anti-abus | 120 QR codes par heure et par client ; jeton de 10 caractères (50 bits) impossible à deviner |
| Ce que voit le restaurateur | l'offre à appliquer, le numéro de la visite, des totaux (jour, 7 et 30 jours, clients fidèles) : **jamais de nom ni d'identifiant** |
| Conservation | QR codes effacés après 1 jour ; visites après 13 mois (ménage nocturne « purge ») |

Fichiers : migration `supabase/migrations/20261104090000_visit_passes.sql` (tables `visit_passes`, `visits`, fonctions
`issue_visit_pass`, `redeem_visit_pass`, `visit_pass_status`, `merchant_visit_summary`), scénarios dans
`supabase/tests/rls/tests.sql` (bloc « QR code de visite »), interface dans `index.html` (`VisitPass`, `Scanner`),
bibliothèques `vendor/qrcode-generator-2.0.4` (dessin du QR code) et `vendor/jsqr-1.4.0` (lecture sur iPhone et
navigateurs sans lecteur intégré), surveillées par `scripts/check-vendor.mjs`.
La caméra est autorisée pour le site seul (`Permissions-Policy: camera=(self)`) ; l'image est lue sur le téléphone et
n'est jamais envoyée.
