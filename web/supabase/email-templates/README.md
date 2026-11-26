# E-mails de FlashMiam (Supabase Auth)

Modèles des e-mails envoyés par Supabase : codes de vérification et liens de confirmation, aux couleurs de FlashMiam
(logo, orange du site, code en grand, explication si l'on n'a rien demandé). Mise en page en tableaux et styles en
ligne : lus correctement par Gmail, Outlook et Apple Mail.

| Fichier | Modèle dans Supabase | Quand il part |
| --- | --- | --- |
| `confirmation.html` | Confirm signup | création d'un compte (code à saisir) |
| `magic_link.html` | Magic Link | connexion par code (compte inutilisé depuis 14 jours, code renvoyé) |
| `recovery.html` | Reset password | « Mot de passe oublié ? » |
| `email_change.html` | Change Email Address | changement d'adresse depuis le profil |
| `reauthentication.html` | Reauthentication | confirmation avant de changer de mot de passe |

## Les mettre en place

Supabase › projet FlashMiam › **Authentication › Emails › Templates** : pour chaque modèle du tableau, copier l'objet
(`templates.json`, clé `subject`) dans *Subject*, puis le contenu du fichier `.html` dans *Message body*, et
enregistrer. Les variables `{{ .Token }}`, `{{ .ConfirmationURL }}`, `{{ .Email }}` et `{{ .NewEmail }}` sont
remplacées par Supabase.

## Les modifier

Modifier `generate.py`, puis `python3 generate.py` (regénère les `.html` et `templates.json`), et les recoller dans
Supabase.
