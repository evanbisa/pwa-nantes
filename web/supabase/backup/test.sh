#!/usr/bin/env bash
# Test complet de la sauvegarde et de la restauration sur une base PostgreSQL locale ou jetable (sans Supabase) :
#   PGHOST=… PGPORT=… PGUSER=postgres [PGPASSWORD=…] web/supabase/backup/test.sh
# Base source « comme en ligne » : données des scénarios RLS (tests/rls/run.sh, relancé ici) + identités, historique
# des migrations, liste de fichiers, avis. Sauvegarde avec le vrai rôle flashmiam_sauvegarde (mot de passe tiré par
# private.rotate_backup_password()), puis restaurations : base reconstruite par les migrations, base d'origine après
# un accident avec un rôle NON superutilisateur (comme postgres chez Supabase), projet neuf avec les comptes.
set -uo pipefail
R=$(cd "$(dirname "$0")/.." && pwd)
B=$R/backup
OUT=$(mktemp -d)
P="psql -X -q -v ON_ERROR_STOP=1"
ok=0 ko=0
check() { if [ "$1" = 0 ]; then echo "  ✔ $2"; ok=$((ok + 1)); else echo "  ✘ $2"; ko=$((ko + 1)); fi; }
vrai() { if "$@" > /dev/null 2>&1; then echo 0; else echo 1; fi; }
export BACKUP_PASSPHRASE='phrase-de-passe-de-test-assez-longue-0123'
export PGSSLMODE=${PGSSLMODE:-disable}   # base de test locale, sans TLS

sh "$R/tests/rls/run.sh" > "$OUT/rls.log" 2>&1 || { tail -5 "$OUT/rls.log"; echo "✘ Scénarios RLS en échec : base source impossible à préparer"; exit 1; }
$P -d postgres -c "drop database if exists rsf_backup_src with (force)" -c "drop database if exists rsf_backup_dst with (force)" \
  -c "create database rsf_backup_src template rsf_rls_test" 2> /dev/null
$P -d rsf_backup_src <<'SQL'
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, provider_id text not null, identity_data jsonb not null default '{}', email text generated always as (lower(identity_data->>'email')) stored);
insert into auth.identities (user_id, provider, provider_id, identity_data) select id, 'email', id::text, jsonb_build_object('email', email) from auth.users;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);
insert into supabase_migrations.schema_migrations values ('20261019125934', 'init', array['select 1']), ('20261019130421', 'hardening', null);
insert into storage.buckets (id, name, public) values ('test-sauvegarde', 'test-sauvegarde', false) on conflict do nothing;
insert into storage.objects (bucket_id, name) values ('test-sauvegarde', 'a/b.jpg');
-- (préparation : avis ajoutés directement, déclencheurs suspendus)
set session_replication_role = replica;
insert into public.reviews (merchant_id, user_id, rating, comment, author_name)
  select m.id, '33333333-3333-3333-3333-333333333333', 5, 'Très bon', 'Léa' from public.merchants m on conflict do nothing;
set session_replication_role = origin;
SQL
avis_avant=$($P -At -d rsf_backup_src -c "select count(*) from public.reviews")
mdp=$($P -At -d rsf_backup_src -c "select private.rotate_backup_password()")

echo "1. Sauvegarde (rôle en lecture seule flashmiam_sauvegarde, connexion par mot de passe)"
SUPABASE_DB_URL="dbname=rsf_backup_src user=flashmiam_sauvegarde password=$mdp" bash "$B/sauvegarder.sh" "$OUT" > "$OUT/s.log" 2>&1
rc=$?; sed 's/^/    /' "$OUT/s.log"
check $rc "sauvegarde réussie avec le rôle en lecture seule"
F=$(ls "$OUT"/*.tar.gpg 2> /dev/null | head -1)
check "$(vrai test -s "$F")" "fichier chiffré produit"
G=$(mktemp -d)
paquets=$(gpg --homedir "$G" --list-packets --batch --pinentry-mode loopback --passphrase-fd 3 "$F" 3<<< "$BACKUP_PASSPHRASE" 2> /dev/null)
rm -rf "$G"
check "$(vrai grep -q 'symkey enc packet: version 4, cipher 9, aead 0, s2k 3, hash 10' <<< "$paquets")" "chiffrement AES-256, clé dérivée par SHA-512"
check "$(vrai grep -q 'count 65011712' <<< "$paquets")" "65 millions d'itérations pour ralentir les essais de phrases de passe"
check "$(vrai grep -q 'mdc_method: 2' <<< "$paquets")" "intégrité protégée (toute modification du fichier est détectée)"
check "$(vrai bash -c "! grep -qa 'merchants\|auth.users\|Benali' '$F'")" "aucun nom de table ni donnée lisible dans le fichier"
check "$(vrai bash -c "! grep -qiE 'Benali|@resto|[0-9]{2,} lignes' '$OUT/s.log'")" "journal sans donnée ni nombre de lignes"
if [[ ${PGHOST:-} == /* ]]; then
  echo "  • mauvais mot de passe du rôle : non vérifiable ici (connexion locale sans mot de passe)"
else
  SUPABASE_DB_URL="dbname=rsf_backup_src user=flashmiam_sauvegarde password=mauvais" bash "$B/sauvegarder.sh" "$OUT/x" > "$OUT/m.log" 2>&1
  check "$(vrai test $? != 0)" "mauvais mot de passe du rôle : connexion refusée"
fi

echo "2. Vérification seule"
bash "$B/restaurer.sh" "$F" > "$OUT/v.log" 2>&1
rc=$?; sed 's/^/    /' "$OUT/v.log"
check $rc "sauvegarde lisible et complète"
BACKUP_PASSPHRASE='mauvaise-phrase-de-passe-0000000000' bash "$B/restaurer.sh" "$F" > "$OUT/v2.log" 2>&1
check "$(vrai grep -q 'Déchiffrement impossible' "$OUT/v2.log")" "mauvaise phrase de passe : refusée"
cp "$F" "$OUT/abime.gpg"
printf '\x00' | dd of="$OUT/abime.gpg" bs=1 seek=$(($(stat -c %s "$F") / 2)) conv=notrunc 2> /dev/null
bash "$B/restaurer.sh" "$OUT/abime.gpg" > "$OUT/v3.log" 2>&1
check "$(vrai test $? != 0)" "fichier abîmé : détecté"
BACKUP_PASSPHRASE=courte SUPABASE_DB_URL="dbname=rsf_backup_src user=flashmiam_sauvegarde password=$mdp" bash "$B/sauvegarder.sh" "$OUT/x" > "$OUT/c.log" 2>&1
check "$(vrai test $? = 2)" "phrase de passe trop courte : refusée"

echo "3. Restauration dans une base reconstruite par les migrations (comme la vérification automatique)"
$P -d postgres -c "create database rsf_backup_dst"
$P -d rsf_backup_dst -f "$R/tests/rls/stub.sql" > /dev/null 2>&1
for m in $(ls "$R"/migrations/*.sql | sort); do $P -d rsf_backup_dst -f "$m" > /dev/null 2>&1 || echo "    migration en échec : $m"; done
bash "$B/restaurer.sh" "$F" --vers "dbname=rsf_backup_dst" --base-de-test > "$OUT/r0.log" 2>&1
check "$(vrai test $? = 2)" "sans --confirmer : refusé"
bash "$B/restaurer.sh" "$F" --vers "dbname=rsf_backup_dst" --confirmer --base-de-test > "$OUT/r1.log" 2>&1
rc=$?; sed 's/^/    /' "$OUT/r1.log"
check $rc "restauration complète, chaque table retrouve son nombre de lignes"
empreinte="select count(*), md5(string_agg(id::text || name || coalesce(address, ''), ',' order by id)) from public.merchants"
check "$(vrai test "$($P -At -d rsf_backup_src -c "$empreinte")" = "$($P -At -d rsf_backup_dst -c "$empreinte")")" "fiches identiques à la source (contenu comparé)"
seq="select last_value from public.signup_attempts_id_seq"
check "$(vrai test "$($P -At -d rsf_backup_src -c "$seq")" = "$($P -At -d rsf_backup_dst -c "$seq")")" "compteurs (séquences) restaurés"
check "$(vrai test "$($P -At -d rsf_backup_dst -c "select count(*) from storage.objects where bucket_id = 'test-sauvegarde'")" = 0)" "liste des fichiers jamais restaurée (référence seulement)"

echo "4. Accident dans la base d'origine, restauration par un rôle NON superutilisateur (comme postgres chez Supabase)"
$P -d rsf_backup_src <<'SQL'
do $$ begin create role restauration_test login bypassrls password 'restauration-test'; exception when duplicate_object then null; end $$;
grant set on parameter session_replication_role to restauration_test;
grant usage on schema auth, private to restauration_test;
grant select on auth.users to restauration_test;
do $$ declare r record; begin
  for r in select format('alter table %I.%I owner to restauration_test', n.nspname, c.relname) q from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
  loop execute r.q; end loop;
end $$;
SQL
avant=$($P -At -d rsf_backup_src -c "select count(*) from public.merchants")
# Une personne sans avis ni fiche (choisie avant l'accident) supprimera son compte : ses données ne doivent pas revenir
victime=$($P -At -d rsf_backup_src -c "select p.id from public.profiles p where not exists (select 1 from public.reviews r where r.user_id = p.id)
  and not exists (select 1 from public.merchants m where m.user_id = p.id) order by p.id limit 1")
$P -d rsf_backup_src -c "delete from public.reviews" -c "delete from public.promotions" -c "delete from public.merchants where status <> 'published'"
$P -d rsf_backup_src -c "delete from auth.users where id = '$victime'"
bash "$B/restaurer.sh" "$F" --vers "dbname=rsf_backup_src user=restauration_test password=restauration-test" --confirmer > "$OUT/r2.log" 2>&1
rc=$?; sed 's/^/    /' "$OUT/r2.log"
check $rc "restauration réussie avec les droits d'un propriétaire de tables (sans superutilisateur)"
apres=$($P -At -d rsf_backup_src -c "select count(*) from public.merchants")
check "$(vrai test "$apres" = "$avant")" "fiches effacées revenues ($apres/$avant)"
check "$(vrai test "$($P -At -d rsf_backup_src -c "select count(*) from public.reviews")" = "$avis_avant" -a "$avis_avant" -gt 0)" "avis effacés tous revenus ($avis_avant)"
check "$(vrai test "$($P -At -d rsf_backup_src -c "select count(*) from public.profiles where id = '$victime'")" = 0)" "compte supprimé depuis la sauvegarde : son profil ne revient pas (droit à l'effacement)"
check "$(vrai test "$($P -At -d rsf_backup_src -c "select count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)")" = 0)" "aucune ligne orpheline"
check "$(vrai test "$($P -At -d rsf_backup_src -c "select count(*) from pg_stat_activity where application_name = 'flashmiam-restauration'")" = 0)" "connexions de restauration fermées"

echo "5. Projet neuf : restauration avec les comptes"
$P -d postgres -c "drop database if exists rsf_backup_dst with (force)" -c "create database rsf_backup_dst" 2> /dev/null
$P -d rsf_backup_dst -f "$R/tests/rls/stub.sql" > /dev/null 2>&1
$P -d rsf_backup_dst -c "alter table auth.users add column if not exists email_confirmed_at timestamptz, add column if not exists created_at timestamptz not null default now()" \
  -c "create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text not null, provider_id text not null, identity_data jsonb not null default '{}', email text generated always as (lower(identity_data->>'email')) stored)" > /dev/null
for m in $(ls "$R"/migrations/*.sql | sort); do $P -d rsf_backup_dst -f "$m" > /dev/null 2>&1 || echo "    migration en échec : $m"; done
bash "$B/restaurer.sh" "$F" --vers "dbname=rsf_backup_dst" --confirmer --avec-comptes > "$OUT/r3.log" 2>&1
rc=$?; sed 's/^/    /' "$OUT/r3.log"
check $rc "projet neuf : données et comptes restaurés"
check "$(vrai test "$($P -At -d rsf_backup_dst -c "select count(*) from auth.users")" = "$($P -At -d rsf_rls_test -c "select count(*) from auth.users")")" "tous les comptes revenus (mots de passe hachés compris)"
check "$(vrai test "$($P -At -d rsf_backup_dst -c "select count(*) from auth.identities")" -ge 1)" "identités (Google, e-mail) revenues"
bash "$B/restaurer.sh" "$F" --vers "dbname=rsf_backup_dst" --confirmer --avec-comptes > "$OUT/r4.log" 2>&1
check "$(vrai grep -q 'déjà des comptes' "$OUT/r4.log")" "comptes déjà présents : --avec-comptes refusé"
$P -d rsf_backup_dst -c "drop table public.story_likes" > /dev/null
bash "$B/restaurer.sh" "$F" --vers "dbname=rsf_backup_dst" --confirmer > "$OUT/r5.log" 2>&1
check "$(vrai grep -q 'Tables absentes' "$OUT/r5.log")" "structure différente : refusée avant toute modification"

echo
echo "Sauvegarde et restauration : $ok vérifications réussies, $ko en échec"
rm -rf "$OUT"
$P -d postgres -c "drop database if exists rsf_backup_src with (force)" -c "drop database if exists rsf_backup_dst with (force)" > /dev/null 2>&1
[ "$ko" = 0 ]
