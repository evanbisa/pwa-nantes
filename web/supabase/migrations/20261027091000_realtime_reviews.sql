-- =============================================================================
-- Temps réel : les avis ne sont plus diffusés en direct (le site ne les écoute pas, et la diffusion envoyait
-- chaque avis complet à quiconque s'abonnait). Les avis restent lisibles normalement.
-- Aucune donnée supprimée : la table quitte seulement la liste des tables diffusées.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reviews') then
    alter publication supabase_realtime drop table public.reviews;
  end if;
end $$;
