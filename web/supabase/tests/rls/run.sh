#!/bin/sh
# Teste la migration et ses règles de sécurité sur une base PostgreSQL locale « façon Supabase ».
# Usage : PGHOST=… PGPORT=… PGUSER=postgres ./run.sh ../../migrations/20261020090000_init.sql
# (une base temporaire « rsf_rls_test » est créée puis remplacée à chaque lancement)
set -e
DIR=$(dirname "$0")
MIGRATION=${1:-$DIR/../../migrations/20261020090000_init.sql}
P="psql -X -q"
$P -d postgres -c "drop database if exists rsf_rls_test" -c "create database rsf_rls_test" >/dev/null
$P -d rsf_rls_test -v ON_ERROR_STOP=1 -f "$DIR/stub.sql" >/dev/null 2>&1 || { echo "Échec : environnement Supabase simulé"; exit 1; }
$P -d rsf_rls_test -v ON_ERROR_STOP=1 -f "$MIGRATION"
$P -d rsf_rls_test -t -f "$DIR/tests.sql" 2>&1 | grep -vE '^ *$|"sub"'
FAILED=$($P -d rsf_rls_test -t -A -c "select count(*) from t.results where not ok")
[ "$FAILED" = "0" ] || { echo "$FAILED test(s) en échec"; exit 1; }
