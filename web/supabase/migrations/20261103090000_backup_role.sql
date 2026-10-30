-- Sauvegarde automatique de la base (GitHub Actions, voir web/supabase/backup/README.md)
--
-- Rôle « flashmiam_sauvegarde » utilisé par la sauvegarde quotidienne :
--   - lecture de toutes les données (rôle prédéfini pg_read_all_data), règles RLS contournées : indispensable pour une
--     copie complète (sinon pg_dump ne verrait que les lignes autorisées par les policies) ;
--   - AUCUNE écriture : aucun droit INSERT/UPDATE/DELETE/TRUNCATE, aucune création d'objet, transactions en lecture
--     seule par défaut ; pas membre d'anon/authenticated/service_role, donc inutilisable par l'API ;
--   - 3 connexions au plus.
-- Créé SANS mot de passe : il ne peut pas se connecter tant que le propriétaire du projet ne lui en a pas donné un avec
--   select private.rotate_backup_password();
-- dans Supabase › SQL Editor. Le mot de passe est tiré au hasard par la base et n'apparaît que dans ce résultat : il
-- n'est écrit dans aucun journal. (Une commande « alter role … password '…' » tapée à la main, elle, resterait en clair
-- dans les journaux, car Supabase journalise les commandes de structure : log_statement = ddl.)

do $$ begin
  create role flashmiam_sauvegarde with login bypassrls connection limit 3;
exception when duplicate_object then null;
end $$;
grant pg_read_all_data to flashmiam_sauvegarde;
alter role flashmiam_sauvegarde set default_transaction_read_only = on;
alter role flashmiam_sauvegarde set idle_in_transaction_session_timeout = '10min';

-- Nouveau mot de passe du rôle de sauvegarde : 64 caractères 0-9 a-f tirés au hasard (aucun caractère à échapper dans
-- une adresse de connexion). L'ancien cesse aussitôt de fonctionner. Fonction ordinaire (pas SECURITY DEFINER) :
-- seul un rôle déjà autorisé à modifier flashmiam_sauvegarde (le propriétaire du projet) peut l'utiliser.
create or replace function private.rotate_backup_password() returns text
language plpgsql set search_path = '' as $$
declare pwd text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  execute format('alter role flashmiam_sauvegarde with password %L', pwd);
  return pwd;
end $$;
revoke all on function private.rotate_backup_password() from public, anon, authenticated, service_role;
