-- merchant_visitors : refus explicite de tout accès direct (seules les fonctions de statistiques y accèdent)
-- et index pour supprimer rapidement les traces d'un compte supprimé.
create policy "merchant_visitors : aucun accès direct" on public.merchant_visitors
  as restrictive for all to anon, authenticated using (false) with check (false);
create index merchant_visitors_visitor_idx on public.merchant_visitors (visitor_id);
