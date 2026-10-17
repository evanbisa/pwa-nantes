# Roche Street Food

Carte interactive (PWA) des food-trucks, kebabs, burgers et douceurs de La Roche-sur-Yon.

**Site en ligne : https://evanbisa.github.io/pwa-nantes/**

Tout le site tient dans un seul fichier : `index.html`.

## Fonctionnalités

- Création de compte (prénom, e-mail, mot de passe) à la première visite, écran de connexion ensuite, option « Rester connecté », déconnexion.
- Demande de la localisation juste après l'inscription ; si elle est refusée, le bouton en haut à droite la redemande.
- Carte Google Maps (avec une clé API, voir ci-dessous), à plat (sans 3D), en mode jour ou nuit.
- Mise en page adaptée : téléphone (filtres en bas, fiches qui montent du bas) et ordinateur (panneau latéral avec recherche et liste).

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
