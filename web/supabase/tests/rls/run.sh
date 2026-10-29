#!/bin/sh
# Teste la migration et ses règles de sécurité sur une base PostgreSQL locale « façon Supabase ».
# Usage : PGHOST=… PGPORT=… PGUSER=postgres ./run.sh   (applique toutes les migrations puis lance les scénarios)
# (une base temporaire « rsf_rls_test » est créée puis remplacée à chaque lancement)
set -e
DIR=$(dirname "$0")
# Toutes les migrations, dans l'ordre (ou un fichier précis passé en argument)
MIGRATIONS=${1:-$(ls "$DIR"/../../migrations/*.sql | sort)}
P="psql -X -q"
$P -d postgres -c "drop database if exists rsf_rls_test" -c "create database rsf_rls_test" >/dev/null
$P -d rsf_rls_test -v ON_ERROR_STOP=1 -f "$DIR/stub.sql" >/dev/null 2>&1 || { echo "Échec : environnement Supabase simulé"; exit 1; }
for m in $MIGRATIONS; do $P -d rsf_rls_test -v ON_ERROR_STOP=1 -f "$m" || exit 1; done
# Le script s'arrête à la première erreur SQL inattendue : elle compte alors comme un échec
OUT=$($P -d rsf_rls_test -t -v ON_ERROR_STOP=1 -f "$DIR/tests.sql" 2>&1) || { echo "$OUT" | grep -vE '^ *$|"sub"'; echo "Échec : erreur SQL dans les scénarios"; exit 1; }
echo "$OUT" | grep -vE '^ *$|"sub"'
FAILED=$($P -d rsf_rls_test -t -A -c "select count(*) from t.results where not ok")
[ "$FAILED" = "0" ] || { echo "$FAILED test(s) en échec"; exit 1; }
