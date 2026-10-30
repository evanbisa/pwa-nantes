# Sauvegarde automatique de la base

Chaque nuit (entre 3 h et 5 h, heure de Paris), GitHub Actions copie toute la base, la chiffre et la garde **30 jours**, puis
**vérifie qu'elle se restaure** dans une base jetable. En cas d'échec, un ticket « sauvegarde » est ouvert dans le dépôt
(donc un e-mail). L'offre gratuite de Supabase ne fait aucune sauvegarde : celle-ci est la seule.

| | |
|---|---|
| Contenu | toutes les données du site (schémas `public` et `private`), les comptes (`auth.users`, `auth.identities`, mots de passe hachés compris), la liste des fichiers déposés et l'historique des migrations |
| Pas dedans | les fichiers eux-mêmes (photos, justificatifs : Supabase Storage), les réglages des tableaux de bord (Auth, SMTP, secrets des fonctions) |
| Chiffrement | AES-256 (gpg), clé dérivée de la phrase de passe par SHA-512 avec 65 millions d'itérations, intégrité protégée. Le dépôt étant public, les sauvegardes sont téléchargeables par n'importe qui : sans la phrase de passe, elles sont illisibles |
| Accès à la base | rôle `flashmiam_sauvegarde` en **lecture seule** (aucune écriture possible, aucun droit de l'API), connexion chiffrée (TLS) |
| Conservation | 30 jours (artefacts GitHub), puis effacement automatique |
| Journaux | ni donnée, ni nombre de lignes : seulement le nombre de tables et, en cas de problème, la table en cause |

Fichiers : `sauvegarder.sh` (copie et chiffrement), `restaurer.sh` (vérification ou restauration), `test.sh` (test de
bout en bout), workflows `.github/workflows/sauvegarde.yml` et `restauration.yml`, migration `20261103090000_backup_role.sql`.

## Mise en place (une seule fois, 5 minutes)

1. **Mot de passe du rôle de sauvegarde** : Supabase › **SQL Editor**, exécuter
   ```sql
   select private.rotate_backup_password();
   ```
   et copier le résultat (64 caractères). Il est tiré au hasard par la base et n'est écrit dans aucun journal
   (ne jamais taper soi-même `alter role … password '…'` : Supabase journalise ces commandes en clair).
2. **Adresse de connexion** : Supabase › bouton **Connect** (en haut) › **Session pooler**, copier l'adresse, de la forme
   `postgresql://postgres.fnypgfyxbyaqrnklhjxc:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`, puis :
   - remplacer `postgres.fnypgfyxbyaqrnklhjxc` par `flashmiam_sauvegarde.fnypgfyxbyaqrnklhjxc` ;
   - remplacer `[YOUR-PASSWORD]` par le mot de passe de l'étape 1.
3. **Secrets GitHub** : dépôt › **Settings › Secrets and variables › Actions › New repository secret** :
   - `SUPABASE_DB_URL` = l'adresse de l'étape 2 ;
   - `BACKUP_PASSPHRASE` = une phrase de passe d'au moins 32 caractères, créée par un gestionnaire de mots de passe
     **et gardée dans ce gestionnaire** : sans elle, aucune sauvegarde ne peut être relue.
4. **Premier essai** : dépôt › **Actions › Sauvegarde de la base › Run workflow**. Les étapes « sauvegarder » et
   « verifier » doivent passer au vert ; la sauvegarde apparaît en bas de la page de l'exécution (« sauvegarde-base »).

Mot de passe du rôle compromis ou à changer : refaire les étapes 1 à 3 (l'ancien mot de passe cesse aussitôt de
fonctionner).

## Restaurer

Toujours dans une base dont la structure est à jour (migrations du dépôt). La restauration se fait **en une seule
transaction** : si quelque chose échoue, rien n'est modifié. Les lignes d'un compte supprimé depuis la sauvegarde ne
reviennent pas (droit à l'effacement respecté). Les personnes connectées le restent.

### Données effacées ou abîmées (même projet Supabase)

1. Supabase › **Connect › Session pooler** : adresse de connexion du rôle `postgres`, avec le mot de passe de la base
   (réglages de la base, **Database Settings › Reset database password**, s'il est perdu).
2. GitHub : secret `SUPABASE_RESTORE_DB_URL` = cette adresse.
3. GitHub › **Actions › Restaurer une sauvegarde › Run workflow** : laisser « sauvegarde-base » ; numéro d'exécution
   vide pour la plus récente (ou le numéro d'une exécution précise de « Sauvegarde de la base », visible dans son
   adresse) ; taper `RESTAURER`.
   L'état actuel est d'abord sauvegardé (« avant-restauration », 30 jours) : pour annuler, relancer avec
   « avant-restauration ».
4. **Supprimer** le secret `SUPABASE_RESTORE_DB_URL` (il donne un accès en écriture).

### Projet Supabase perdu (projet neuf)

1. Créer le projet, appliquer dans l'ordre les fichiers de `web/supabase/migrations/`, puis `web/supabase/manual/`
   (ménage nocturne), redéployer les fonctions (`web/supabase/functions/`) et leurs secrets, refaire les réglages Auth
   (Google, SMTP, URL du site), mettre à jour l'adresse et la clé publique Supabase du site.
2. Restaurer comme ci-dessus en cochant **« Restaurer aussi les comptes »** (refusé si le projet contient déjà des
   comptes). Les mots de passe des comptes reviennent tels quels (hachés).
3. Les photos et justificatifs ne sont pas dans la sauvegarde : à redemander aux restaurateurs.

### En local, sans GitHub

```sh
# vérifier une sauvegarde téléchargée (aucune base touchée)
BACKUP_PASSPHRASE='…' web/supabase/backup/restaurer.sh flashmiam-sauvegarde-….tar.gpg
# restaurer (client PostgreSQL 17 requis)
BACKUP_PASSPHRASE='…' PGSSLMODE=require web/supabase/backup/restaurer.sh flashmiam-sauvegarde-….tar.gpg \
  --vers 'postgresql://postgres.…:…@…pooler.supabase.com:5432/postgres' --confirmer [--avec-comptes]
```

## Tests

`test.sh` rejoue tout sur une base locale ou jetable : sauvegarde par le vrai rôle en lecture seule (mot de passe tiré
par la fonction), chiffrement, fichier abîmé et mauvaise phrase de passe détectés, restauration complète, restauration
après accident avec un rôle non superutilisateur (comme `postgres` chez Supabase) et droit à l'effacement, projet neuf
avec les comptes, structure différente refusée. Il tourne sur GitHub (PostgreSQL 17) à chaque modification des scripts ou
des migrations :

```sh
PGHOST=… PGPORT=… PGUSER=postgres [PGPASSWORD=…] web/supabase/backup/test.sh
```

Les droits du rôle de sauvegarde sont aussi vérifiés par les scénarios de sécurité (`web/supabase/tests/rls`).
