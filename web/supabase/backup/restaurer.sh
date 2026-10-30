#!/usr/bin/env bash
# Vérifie ou restaure une sauvegarde chiffrée produite par sauvegarder.sh.
#
#   BACKUP_PASSPHRASE=… restaurer.sh <sauvegarde.tar.gpg>
#       Vérification seule, aucune base touchée : déchiffrement, empreintes, nombre de lignes de chaque table.
#
#   BACKUP_PASSPHRASE=… restaurer.sh <sauvegarde.tar.gpg> --vers <adresse de la base> --confirmer [option]
#       Remplace les données du site (schémas public et private) par celles de la sauvegarde, en UNE transaction : en
#       cas d'erreur, rien n'est modifié. La base cible doit avoir la structure à jour (migrations du dépôt appliquées).
#       Les lignes rattachées à un compte supprimé depuis la sauvegarde sont retirées : une restauration ne fait pas
#       revenir les données d'une personne qui a supprimé son compte entre-temps.
#     --avec-comptes  restaure aussi les comptes (auth.users, auth.identities), pour un projet Supabase NEUF uniquement :
#                     refusé si la base cible contient déjà des comptes ;
#     --base-de-test  base jetable reconstruite par les migrations, sans comptes (vérification automatique) : toutes les
#                     lignes sont gardées, et chaque table doit retrouver exactement son nombre de lignes.
#
# Rien n'est affiché sur les données elles-mêmes (seulement les tables en cause en cas de problème).
set -euo pipefail

USAGE="usage : restaurer.sh <sauvegarde.tar.gpg> [--vers <adresse de la base> --confirmer [--avec-comptes | --base-de-test]]"
FICHIER=${1:?"$USAGE"}
shift
CIBLE="" CONFIRME=0 COMPTES=0 TEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --vers) CIBLE=${2:?"--vers : adresse de la base manquante"}; shift 2 ;;
    --confirmer) CONFIRME=1; shift ;;
    --avec-comptes) COMPTES=1; shift ;;
    --base-de-test) TEST=1; shift ;;
    *) echo "Option inconnue : $1 ($USAGE)" >&2; exit 2 ;;
  esac
done
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquante}"
[ -f "$FICHIER" ] || { echo "✘ Fichier introuvable : $FICHIER" >&2; exit 2; }
if [ -n "$CIBLE" ] && [ "$CONFIRME" != 1 ]; then
  echo "✘ Restauration dans une base : ajouter --confirmer (les données du site y seront remplacées)." >&2
  exit 2
fi
if [ "$COMPTES" = 1 ] && [ "$TEST" = 1 ]; then echo "✘ --avec-comptes et --base-de-test ne vont pas ensemble." >&2; exit 2; fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -m 700 "$WORK/gnupg"
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

# 1. Déchiffrement et contrôle d'intégrité
if ! gpg --homedir "$WORK/gnupg" --batch --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt --output "$WORK/sauvegarde.tar" "$FICHIER" 3<<< "$BACKUP_PASSPHRASE" 2> "$WORK/gpg.err"; then
  echo "✘ Déchiffrement impossible : mauvaise phrase de passe, ou fichier abîmé." >&2
  exit 1
fi
gpgconf --homedir "$WORK/gnupg" --kill all 2>/dev/null || true
tar -C "$WORK" -xf "$WORK/sauvegarde.tar" manifeste.txt donnees.dump structure.dump
sed -n '/^Empreintes SHA-256 :$/,$p' "$WORK/manifeste.txt" | tail -n +2 > "$WORK/empreintes.txt"
if [ "$(wc -l < "$WORK/empreintes.txt")" != 2 ] || ! (cd "$WORK" && sha256sum --check --quiet --strict empreintes.txt); then
  echo "✘ Empreintes différentes : sauvegarde abîmée." >&2
  exit 1
fi
comptes_archive "$WORK/donnees.dump" > "$WORK/archive.tsv"
sed -n '/^Lignes par table/,/^$/p' "$WORK/manifeste.txt" | sed '1d;$d' > "$WORK/manifeste.tsv"
if ! cmp -s "$WORK/manifeste.tsv" "$WORK/archive.tsv" || [ ! -s "$WORK/archive.tsv" ]; then
  echo "✘ Le contenu ne correspond pas au manifeste : sauvegarde incomplète." >&2
  exit 1
fi
date_sauvegarde=$(sed -n 's/^Date (UTC) : //p' "$WORK/manifeste.txt")
tables=$(wc -l < "$WORK/archive.tsv")
if [ -z "$CIBLE" ]; then
  echo "✔ Sauvegarde du $date_sauvegarde lisible et complète : $tables tables, empreintes vérifiées."
  exit 0
fi

# 2. Contenu à restaurer : données (et compteurs) des schémas public et private ; comptes sur demande.
#    Jamais : la liste des fichiers (storage.objects, les fichiers eux-mêmes ne sont pas dans la sauvegarde) ni
#    l'historique des migrations (tenu par Supabase lors de l'application des migrations).
export PGAPPNAME=flashmiam-restauration PGCONNECT_TIMEOUT=30
q() { psql "$CIBLE" -X -At -v ON_ERROR_STOP=1 "$@"; }
pg_restore --list "$WORK/donnees.dump" | awk -v comptes="$COMPTES" '
  /^;/ { next }
  ($4 == "TABLE" && $5 == "DATA") || ($4 == "SEQUENCE" && $5 == "SET") {
    if ($6 == "public" || $6 == "private" || (comptes == 1 && $6 == "auth" && ($7 == "users" || $7 == "identities"))) print
  }' > "$WORK/liste.txt"
mapfile -t TABLES < <(awk '$4 == "TABLE" { print $6 "." $7 }' "$WORK/liste.txt")
mapfile -t VIDER < <(printf '%s\n' "${TABLES[@]}" | grep -E '^(public|private)\.')
for t in "${TABLES[@]}"; do
  [[ $t =~ ^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$ ]] || { echo "✘ Nom de table inattendu dans la sauvegarde : $t" >&2; exit 1; }
done
liste_sql=$(printf "'%s'," "${TABLES[@]}")
manquantes=$(q -c "select string_agg(t, ', ') from unnest(array[${liste_sql%,}]) t where to_regclass(t) is null")
if [ -n "$manquantes" ]; then
  echo "✘ Tables absentes de la base cible : $manquantes. Appliquer d'abord les migrations du dépôt (README.md)." >&2
  exit 1
fi
if [ "$COMPTES" = 1 ] && [ "$(q -c 'select count(*) from auth.users')" != 0 ]; then
  echo "✘ La base cible contient déjà des comptes : --avec-comptes est réservé à un projet neuf." >&2
  exit 1
fi

# 3. Restauration en une transaction : déclencheurs suspendus pendant la copie (les lignes reviennent telles quelles,
#    sans effet de bord : pas de notification renvoyée, dates gardées), puis retrait des lignes de comptes disparus.
pg_restore --data-only --use-list="$WORK/liste.txt" --file="$WORK/donnees.sql" "$WORK/donnees.dump"
vider_sql=$(printf '%s, ' "${VIDER[@]}")
cat > "$WORK/nettoyage.sql" <<'SQL'
-- Lignes rattachées à un compte qui n'existe plus (supprimé depuis la sauvegarde) : retirées comme si la suppression
-- du compte avait eu lieu après la restauration (cascade), ou détachées si le lien est facultatif.
select format(case c.confdeltype
    when 'n' then 'update %1$s set %2$I = null where %2$I is not null and not exists (select 1 from auth.users u where u.id = %1$s.%2$I)'
    else 'delete from %1$s where not exists (select 1 from auth.users u where u.id = %1$s.%2$I)' end,
  c.conrelid::regclass, a.attname)
from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and cardinality(c.conkey) = 1
  and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)
order by 1
\gexec
SQL
nettoyage=(-c "set session_replication_role = origin")
if [ "$TEST" != 1 ]; then nettoyage+=(-f "$WORK/nettoyage.sql"); fi
psql "$CIBLE" -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica" \
  -c "truncate table ${vider_sql%, }" \
  -f "$WORK/donnees.sql" \
  "${nettoyage[@]}" > "$WORK/psql.out"
q -c "analyze ${vider_sql%, }" > /dev/null

# 4. Contrôle : chaque table restaurée retrouve son nombre de lignes (moins les lignes de comptes disparus)
selects=$(printf "select '%s', count(*) from %s union all " $(for t in "${TABLES[@]}"; do echo "$t $t"; done))
q -F $'\t' -c "${selects% union all }" | LC_ALL=C sort > "$WORK/cible.tsv"
awk -F '\t' 'NR == FNR { voulue[$1]; next } $1 in voulue' <(printf '%s\n' "${TABLES[@]}") "$WORK/archive.tsv" > "$WORK/attendu.tsv"
bilan=$(LC_ALL=C join -t $'\t' -a 1 -e ABSENTE -o 0,1.2,2.2 "$WORK/attendu.tsv" "$WORK/cible.tsv" | awk -F '\t' -v test="$TEST" '
  $3 == "ABSENTE" || $3 > $2 || (test == 1 && $3 != $2) { print "  ✘ " $1 " : nombre de lignes inattendu"; bad = 1; next }
  $3 < $2 { retirees += $2 - $3 }
  END { if (!bad && retirees) print "  • " retirees " ligne(s) de comptes supprimés depuis la sauvegarde retirée(s)" }')
if grep -q '✘' <<< "$bilan"; then
  echo "✘ Restauration incomplète :" >&2
  echo "$bilan" >&2
  exit 1
fi
echo "✔ Données du $date_sauvegarde restaurées : ${#TABLES[@]} tables$([ "$COMPTES" = 1 ] && echo ', comptes compris')."
if [ -n "$bilan" ]; then echo "$bilan"; fi
