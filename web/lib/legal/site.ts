/**
 * Informations des pages juridiques — un seul endroit à modifier.
 * `null` : information pas encore disponible (entreprise en cours de création). La ligne ou la phrase concernée
 * n'est alors pas affichée, sans champ vide ni mention « à compléter » : les pages restent propres pour les
 * restaurateurs qui les lisent. Dès que l'information existe, remplacez `null` par sa valeur : elle apparaît partout.
 * Une valeur encore entre crochets [AINSI] serait surlignée en orange sur les pages (à éviter en ligne).
 */
export const LEGAL: {
  editorName: string; legalForm: string | null; shareCapital: string | null; address: string | null;
  siren: string | null; siret: string | null; registration: string | null; vatNumber: string | null;
  phone: string | null; email: string; instagram: string; publicationDirector: string;
  plans: { essentiel: { name: string }; premium: { name: string } };
  paymentProvider: string; vatMention: string | null; cgvEffectiveDate: string | null;
  courtCity: string | null; consumerMediator: string | null; updated: string;
} = {
  // ----- Éditeur du site (mentions légales, loi pour la confiance dans l'économie numérique) -----
  /** Nom et prénom (entrepreneur individuel) ou raison sociale (société) */
  editorName: "Evan BIHAN SANZ",
  /** Ex. « Entrepreneur individuel (micro-entreprise) », « SAS », « SASU », « EURL » */
  legalForm: null,
  /** Société : « 1 000 € » ; entrepreneur individuel : « Sans objet » */
  shareCapital: null,
  /** Adresse du siège (domicile de l'entrepreneur, ou adresse d'une société de domiciliation) */
  address: null,
  siren: null,
  siret: null,
  /** Ex. « RCS La Roche-sur-Yon 123 456 789 » ou « Registre national des entreprises (RNE) » */
  registration: null,
  vatNumber: null,
  phone: null,
  email: "contact@flashmiam.fr",
  /** Compte Instagram (sans @) */
  instagram: "flashmiam85",
  publicationDirector: "Evan BIHAN SANZ",

  // ----- Abonnements restaurateurs (CGV) : noms des formules. Les prix ne figurent pas dans les CGV (encore à
  // fixer) : ils sont affichés sur la page de souscription avant tout paiement.
  plans: {
    essentiel: { name: "Essentiel" },
    premium: { name: "Premium" },
  },
  /** Plateforme de paiement des abonnements (raison sociale et pays à vérifier dans les conditions signées avec Whop) */
  paymentProvider: "Whop, Inc. (États-Unis)",
  /** Ex. « TVA à 20 % en sus, soit 34,80 € TTC par mois » ou « TVA non applicable, article 293 B du CGI » */
  vatMention: null,
  /** Date d'ouverture des abonnements payants (les CGV s'appliquent à partir de cette date) */
  cgvEffectiveDate: null,

  // ----- Litiges -----
  /** Tribunal compétent entre professionnels (CGV), ex. « La Roche-sur-Yon » */
  courtCity: null,
  /** Médiateur de la consommation (clients) : nom et site internet */
  consumerMediator: null,

  /** Date de la dernière mise à jour des documents */
  updated: "24 novembre 2026",
};

/** Une information reste-t-elle à compléter ? (valeur encore entre crochets) */
export const isPlaceholder = (value: string) => /^\[.*\]$/.test(value);
