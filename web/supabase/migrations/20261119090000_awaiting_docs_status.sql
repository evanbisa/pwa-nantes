-- Fiche restaurateur « en attente des justificatifs » : complète et abonnée, mais invisible sur la carte tant que les
-- justificatifs obligatoires (Kbis et attestation d'hygiène) ne sont pas déposés. Valeur ajoutée seule dans cette
-- migration : une nouvelle valeur d'énumération ne peut pas servir dans la transaction qui la crée.
alter type public.merchant_status add value if not exists 'awaiting_docs' after 'draft';
