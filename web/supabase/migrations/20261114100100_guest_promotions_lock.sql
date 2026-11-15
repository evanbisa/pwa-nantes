-- Offres réservées aux comptes, étape 2 (14 novembre 2026) : un visiteur sans compte ne lit plus la table des offres
-- directement, ni en direct (temps réel) ; il passe par guest_promotions(), qui ne donne le texte que de 3 offres.
-- Appliquée après la publication du site qui utilise guest_promotions() (sinon la carte des visiteurs perdrait ses
-- offres le temps de la publication).
drop policy "promotions : lecture des offres en cours (visiteurs)" on public.promotions;
revoke select on public.promotions from anon;
