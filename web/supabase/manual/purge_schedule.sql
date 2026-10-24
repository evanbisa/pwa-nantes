-- =============================================================================
-- Ménage quotidien (projet en ligne uniquement : contient son adresse).
-- Chaque nuit à 2 h 17 UTC (3 h 17 à Paris en hiver, 4 h 17 en été), la base appelle la fonction serveur « purge »,
-- qui efface ce qui a dépassé sa durée de conservation (voir supabase/functions/purge/handler.ts).
-- Ce script ne supprime rien lui-même. Appliqué le 24 octobre 2026 (outil Supabase, migration « purge_schedule »).
-- =============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('flashmiam-purge', '17 2 * * *', $job$
  select net.http_post(
    url := 'https://fnypgfyxbyaqrnklhjxc.supabase.co/functions/v1/purge',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$job$);
