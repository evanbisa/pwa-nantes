-- =============================================================================
-- Ménage quotidien (projet en ligne uniquement : contient son adresse).
-- Chaque nuit à 2 h 17 UTC (3 h 17 à Paris en hiver, 4 h 17 en été), la base appelle la fonction serveur « purge »,
-- qui efface ce qui a dépassé sa durée de conservation et ferme les sessions trop anciennes
-- (voir supabase/functions/purge/handler.ts). Ce script ne supprime rien lui-même.
--
-- L'appel porte le jeton « x-cron-token », tiré au hasard dans la base (private.app_secrets, migration
-- 20261102090000_security_hardening) : la fonction refuse tout appel qui ne vient pas de cette tâche.
-- Appliqué le 24 octobre 2026 (migration « purge_schedule »), jeton ajouté le 30 octobre 2026 (« purge_schedule_token »).
-- Relancer ce script remplace la tâche du même nom (pg_cron).
-- =============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('flashmiam-purge', '17 2 * * *', $job$
  select net.http_post(
    url := 'https://fnypgfyxbyaqrnklhjxc.supabase.co/functions/v1/purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select s.value from private.app_secrets s where s.name = 'purge_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$job$);
