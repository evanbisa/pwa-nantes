-- Vérification des restaurateurs par l'équipe (choix A) : nouvel état « awaiting_review ».
-- Une valeur ajoutée à un type énuméré ne peut pas servir dans la même transaction : migration à part.
-- Migration additive.
alter type public.merchant_status add value if not exists 'awaiting_review' after 'awaiting_docs';
