-- =============================================================================
-- Durcissement après l'analyse de sécurité Supabase (Advisors), sans suppression :
-- 1. is_merchant_owner() passe dans un schéma non exposé par l'API : plus appelable via /rest/v1/rpc.
-- 2. Une seule politique de lecture par rôle sur merchants (recommandation de performance).
-- =============================================================================

-- 1. Schéma « private » : non exposé par l'API Supabase
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- La politique de merchant_private suit la fonction (référencée par identifiant, pas par nom)
alter function public.is_merchant_owner(uuid) set schema private;
revoke execute on function private.is_merchant_owner(uuid) from public, anon;
grant execute on function private.is_merchant_owner(uuid) to authenticated;

-- 2. Lecture des fiches : visiteurs = fiches en ligne ; connectés = fiches en ligne + la sienne
alter policy "merchants : lecture publique des commerces en ligne" on public.merchants to anon;
alter policy "merchants : le propriétaire voit sa fiche" on public.merchants
  using ((status = 'published' and is_open) or user_id = (select auth.uid()));
alter policy "merchants : le propriétaire voit sa fiche" on public.merchants
  rename to "merchants : lecture (commerces en ligne et sa propre fiche)";
