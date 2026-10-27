/**
 * Informations à compléter pour les pages juridiques — un seul endroit à modifier.
 * Toute valeur encore entre crochets [AINSI] reste surlignée en orange sur les pages, pour ne pas l'oublier.
 * Une fois une valeur renseignée, retirez les crochets : elle s'affiche alors normalement partout.
 */
export const LEGAL = {
  // ----- Éditeur du site (mentions légales, loi pour la confiance dans l'économie numérique) -----
  /** Nom et prénom (entrepreneur individuel) ou raison sociale (société) */
  editorName: "[NOM_PRÉNOM_OU_RAISON_SOCIALE]",
  /** Ex. « Entrepreneur individuel (micro-entreprise) », « SAS », « SASU », « EURL » */
  legalForm: "[FORME_JURIDIQUE]",
  /** Société : « 1 000 € » ; entrepreneur individuel : « Sans objet » */
  shareCapital: "[CAPITAL_SOCIAL]",
  address: "[ADRESSE_DU_SIÈGE]",
  siren: "[SIREN]",
  siret: "[SIRET]",
  /** Ex. « RCS La Roche-sur-Yon 123 456 789 » ou « Registre national des entreprises (RNE) » */
  registration: "[IMMATRICULATION_RCS_OU_RNE]",
  vatNumber: "[NUMÉRO_TVA_INTRACOMMUNAUTAIRE]",
  phone: "[TÉLÉPHONE]",
  email: "flashmiampro@gmail.com",
  publicationDirector: "[DIRECTEUR_DE_LA_PUBLICATION]",

  // ----- Abonnements restaurateurs (CGV) : mêmes prix que la table billing_plans de la base et que le site -----
  plans: {
    essentiel: { name: "Essentiel", month: "29 € HT", year: "290 € HT" },
    premium: { name: "Premium", month: "79 € HT", year: "790 € HT" },
  },
  /** Plateforme de paiement des abonnements (raison sociale et pays à vérifier dans les conditions signées avec Whop) */
  paymentProvider: "Whop, Inc. (États-Unis)",
  /** Ex. « TVA à 20 % en sus, soit 34,80 € TTC par mois » ou « TVA non applicable, article 293 B du CGI » */
  vatMention: "[MENTION_TVA]",
  /** Date d'ouverture des abonnements payants (les CGV s'appliquent à partir de cette date) */
  cgvEffectiveDate: "[DATE_D'ENTRÉE_EN_VIGUEUR_DES_CGV]",

  // ----- Litiges -----
  /** Tribunal compétent entre professionnels (CGV), ex. « La Roche-sur-Yon » */
  courtCity: "[VILLE_DU_TRIBUNAL]",
  /** Médiateur de la consommation (clients) : nom et site internet */
  consumerMediator: "[MÉDIATEUR_DE_LA_CONSOMMATION]",

  /** Date de la dernière mise à jour des documents */
  updated: "27 octobre 2026",
} as const;

/** Une information reste-t-elle à compléter ? (valeur encore entre crochets) */
export const isPlaceholder = (value: string) => /^\[.*\]$/.test(value);
