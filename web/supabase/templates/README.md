# Modèles d'e-mail FlashMiam (Supabase Auth)

Les e-mails de code (création de compte, connexion, mot de passe oublié) sont envoyés par Supabase. Leur texte se
règle dans le tableau de bord, pas dans le code du site : copier chaque fichier ci-dessous dans
**Supabase › Authentication › Emails › Templates** (projet `fnypgfyxbyaqrnklhjxc`), onglet *Source*, puis *Save*.

| Modèle Supabase   | Fichier               | Objet à mettre                               |
|-------------------|-----------------------|----------------------------------------------|
| Confirm signup    | `confirm-signup.html` | `Votre code FlashMiam`                       |
| Magic link        | `magic-link.html`     | `Votre code de connexion FlashMiam`          |
| Reset password    | `reset-password.html` | `Réinitialisation de votre mot de passe FlashMiam` |

- `{{ .Token }}` : le code saisi dans le site ; `{{ .ConfirmationURL }}` : le même accès en un clic (bouton).
- Le texte annonce une validité d'**1 heure** : réglage *Email OTP Expiration* (3600 s par défaut) dans
  Authentication › Providers › Email. Le changer ici aussi s'il est modifié.
- Mise en page en tableaux et styles en ligne (compatibles Gmail, Outlook, Apple Mail) ; icône chargée depuis
  `https://flashmiam.fr/icon-192.png`.
