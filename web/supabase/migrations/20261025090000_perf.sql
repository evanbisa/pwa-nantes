-- =============================================================================
-- Performance sous forte affluence (migration non destructive).
-- Les stories sont gardées 30 jours après leur fin (statistiques) et les promotions terminées restent en base :
-- le site ne lit plus que celles en cours (filtre sur la date de fin) ; ces index évitent de relire l'historique,
-- et les règles d'accès ne sont plus évaluées que sur les lignes en ligne.
-- =============================================================================
create index if not exists stories_expires_idx on public.stories (expires_at);
create index if not exists promotions_ends_idx on public.promotions (ends_at);
