#!/usr/bin/env bash
# Sauvegarde chiffrée de la base FlashMiam : données du site (schémas public et private), comptes (auth.users,
# auth.identities), liste des fichiers déposés (storage.objects) et historique des migrations.
#
#   SUPABASE_DB_URL=… BACKUP_PASSPHRASE=… web/supabase/backup/sauvegarder.sh <dossier de sortie>
#
#   SUPABASE_DB_URL    adresse de connexion du rôle en lecture seule « flashmiam_sauvegarde » (pooler Supabase, mode
#                      session) ; connexion chiffrée exigée (TLS) ;
#   BACKUP_PASSPHRASE  phrase de passe qui chiffre la sauvegarde (AES-256), 24 caractères au moins.
#
# Produit <dossier>/flashmiam-sauvegarde-<date>.tar.gpg, archive chiffrée contenant :
#   donnees.dump    les données (format de pg_dump : restauration complète ou table par table, voir restaurer.sh) ;
#   structure.dump  la structure des schémas public et private, pour référence (la structure de travail vient des
#                   migrations du dépôt) ;
#   manifeste.txt   date, versions, nombre de lignes de chaque table, empreintes SHA-256 des deux fichiers.
# Contrôles : chaque table du site est présente, son nombre de lignes correspond à la base (aux visites près pendant la
# copie), l'archive se déchiffre avec la phrase de passe. Le dépôt GitHub étant public, rien n'est affiché sur les
# données : ni contenu, ni nombre de lignes (seulement le nombre de tables et, en cas de problème, la table en cause).
set -euo pipefail

OUT=${1:?"usage : sauvegarder.sh <dossier de sortie>"}
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL manquante}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE manquante}"
if [ "${#BACKUP_PASSPHRASE}" -lt 24 ]; then
  echo "✘ Phrase de passe trop courte : 24 caractères au moins." >&2
  exit 2
fi
export PGSSLMODE="${PGSSLMODE:-require}" PGAPPNAME=flashmiam-sauvegarde PGCONNECT_TIMEOUT=30
DB=$SUPABASE_DB_URL
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -m 700 "$WORK/gnupg"
q() { psql "$DB" -X -At -v ON_ERROR_STOP=1 "$@"; }
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

# pg_dump doit être au moins de la version du serveur
server=$(q -c "show server_version_num")
client=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
if [ "$client" -lt $((server / 10000)) ]; then
  echo "✘ pg_dump $client trop ancien pour PostgreSQL $((server / 10000))." >&2
  exit 2
fi

# Tables sauvegardées : tout public et private (tables et compteurs), plus les comptes, la liste des fichiers et
# l'historique des migrations
SELECTION="(n.nspname in ('public', 'private')
   or (n.nspname, c.relname) in (('auth', 'users'), ('auth', 'identities'), ('storage', 'objects'), ('supabase_migrations', 'schema_migrations')))"
mapfile -t RELATIONS < <(q -c "select quote_ident(n.nspname) || '.' || quote_ident(c.relname) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p', 'S') and $SELECTION order by 1")
for attendue in auth.users auth.identities public.profiles public.merchants; do
  printf '%s\n' "${RELATIONS[@]}" | grep -qx "$attendue" || { echo "✘ Table $attendue introuvable : ce n'est pas la base FlashMiam ?" >&2; exit 2; }
done
args=()
for r in "${RELATIONS[@]}"; do args+=(--table="$r"); done

pg_dump "$DB" --format=custom --data-only --strict-names --lock-wait-timeout=60s "${args[@]}" --file="$WORK/donnees.dump"
pg_dump "$DB" --format=custom --schema-only --strict-names --lock-wait-timeout=60s --no-subscriptions \
  --schema=public --schema=private --file="$WORK/structure.dump"

# Nombre de lignes de chaque table : dans l'archive (exact) et dans la base juste après la copie
comptes_archive "$WORK/donnees.dump" > "$WORK/archive.tsv"
q -F $'\t' -c "select quote_ident(n.nspname) || '.' || quote_ident(c.relname),
    (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and $SELECTION" | LC_ALL=C sort > "$WORK/base.tsv"

# Écart toléré : les visites continuent pendant la copie (max(20 lignes, 2 %)) ; au-delà, la copie est incomplète
ecarts=$(LC_ALL=C join -t $'\t' -a 1 -a 2 -e ABSENTE -o 0,1.2,2.2 "$WORK/archive.tsv" "$WORK/base.tsv" | awk -F '\t' '
  $2 == "ABSENTE" { print "  ✘ " $1 " : absente de la sauvegarde"; next }
  $3 == "ABSENTE" { print "  ✘ " $1 " : absente de la base"; next }
  { d = $2 - $3; if (d < 0) d = -d; m = ($2 > $3 ? $2 : $3); tol = m * 0.02; if (tol < 20) tol = 20
    if (d > tol) print "  ✘ " $1 " : écart de " d " lignes entre la sauvegarde et la base" }')
if [ -n "$ecarts" ]; then
  echo "✘ Sauvegarde incomplète :" >&2
  echo "$ecarts" >&2
  exit 1
fi
tables=$(wc -l < "$WORK/archive.tsv")

date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
nom="flashmiam-sauvegarde-$(date -u +%Y-%m-%dT%H%MZ)"
{
  echo "FlashMiam : sauvegarde de la base"
  echo "Date (UTC) : $date_utc"
  echo "PostgreSQL : $(q -c 'show server_version') ; $(pg_dump --version)"
  echo "Restauration : web/supabase/backup/README.md (dépôt FlashMiam)"
  echo
  echo "Lignes par table ($tables tables) :"
  cat "$WORK/archive.tsv"
  echo
  echo "Empreintes SHA-256 :"
  (cd "$WORK" && sha256sum donnees.dump structure.dump)
} > "$WORK/manifeste.txt"

tar -C "$WORK" -cf "$WORK/$nom.tar" manifeste.txt donnees.dump structure.dump
mkdir -p "$OUT"
gpg --homedir "$WORK/gnupg" --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none \
  --output "$OUT/$nom.tar.gpg" "$WORK/$nom.tar" 3<<< "$BACKUP_PASSPHRASE"

# Contrôle : l'archive chiffrée se déchiffre et redonne exactement le même contenu
attendu=$(sha256sum < "$WORK/$nom.tar")
obtenu=$(gpg --homedir "$WORK/gnupg" --batch --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
  --decrypt "$OUT/$nom.tar.gpg" 3<<< "$BACKUP_PASSPHRASE" | sha256sum)
if [ "$attendu" != "$obtenu" ]; then
  echo "✘ L'archive chiffrée ne se relit pas correctement." >&2
  rm -f "$OUT/$nom.tar.gpg"
  exit 1
fi
gpgconf --homedir "$WORK/gnupg" --kill all 2>/dev/null || true

echo "✔ Sauvegarde chiffrée : $nom.tar.gpg ($tables tables, $(du -h "$OUT/$nom.tar.gpg" | cut -f1))"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "fichier=$OUT/$nom.tar.gpg" >> "$GITHUB_OUTPUT"; fi
