-- Index des clés étrangères signalées par l'assistant de performance de Supabase (14 novembre 2026).
-- Sans eux, supprimer une fiche ou une promotion parcourt toute la table des QR codes / des visites.
create index if not exists visit_passes_merchant_idx on public.visit_passes (merchant_id);
create index if not exists visit_passes_promo_idx on public.visit_passes (promo_id);
create index if not exists visits_promo_idx on public.visits (promo_id);
