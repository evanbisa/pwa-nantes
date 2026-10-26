import {
  Calculator, CircleX, CreditCard, FileCheck, Gavel, Handshake, Hourglass, Info, Receipt, Repeat, ShieldCheck, Undo2,
} from "lucide-react";
import { LEGAL } from "./site";
import type { LegalDoc } from "./types";

const mail = `{{${LEGAL.email}|mailto:${LEGAL.email}}}`;

/** Conditions générales de vente : abonnement des restaurateurs (contrat entre professionnels). */
export const cgv: LegalDoc = {
  slug: "cgv",
  title: "Conditions générales de vente",
  short: "CGV",
  icon: Receipt,
  summary: `L'abonnement FlashMiam Pro des restaurateurs : ${LEGAL.priceExclTax} par mois, sans engagement.`,
  updated: LEGAL.updated,
  notice: `Ces conditions s'appliquent aux abonnements souscrits à compter du ${LEGAL.cgvEffectiveDate}, date d'ouverture des abonnements payants.`,
  sections: [
    {
      id: "champ",
      title: "Champ d'application",
      icon: Info,
      blocks: [
        `Les présentes conditions générales de vente (« CGV ») régissent l'abonnement **FlashMiam Pro** souscrit par un restaurateur (le « Client ») auprès de ${LEGAL.editorName} (l'« Éditeur », voir les {{mentions légales|/legal/mentions-legales}}).`,
        "L'abonnement est réservé aux **professionnels** agissant pour les besoins de leur activité de restauration, identifiés par un numéro SIRET vérifié. Les présentes CGV constituent le socle de la négociation commerciale au sens de l'article L. 441-1 du Code de commerce.",
        "Elles sont acceptées en cochant la case prévue lors de la souscription et prévalent sur tout autre document du Client. Les {{conditions générales d'utilisation|/legal/cgu}} s'appliquent également.",
      ],
    },
    {
      id: "offre",
      title: "Contenu de l'abonnement",
      icon: ShieldCheck,
      blocks: [
        "L'abonnement FlashMiam Pro comprend, pendant toute sa durée :",
        {
          list: [
            "la publication de la fiche de l'établissement sur la carte et dans la liste (description, menu et prix, photos, horaires, adresse) ;",
            "la publication de stories (24 heures) et de promotions, avec notification des clients abonnés à l'établissement ;",
            "les statistiques de fréquentation de la fiche, en totaux anonymes (vues, provenance, interactions, public) ;",
            "la réponse aux avis des clients et leur signalement.",
          ],
        },
        "Le service est accessible en ligne, sur ordinateur et sur téléphone. L'Éditeur peut le faire évoluer pour l'améliorer, sans réduire ses fonctions essentielles pendant la période payée.",
      ],
    },
    {
      id: "prix",
      title: "Prix",
      icon: Calculator,
      blocks: [
        {
          facts: [
            ["Prix", `**${LEGAL.priceExclTax} par mois**`],
            ["TVA", LEGAL.vatMention],
            ["Engagement", "Aucun : abonnement mensuel, résiliable à tout moment"],
          ],
        },
        "Le prix applicable est celui affiché au moment de la souscription. L'Éditeur peut le modifier pour les périodes à venir en informant le Client par e-mail au moins **30 jours** à l'avance ; le Client qui refuse le nouveau prix peut résilier avant son application, sans frais.",
      ],
    },
    {
      id: "paiement",
      title: "Paiement par Stripe",
      icon: CreditCard,
      blocks: [
        "Le paiement s'effectue par carte bancaire, d'avance, chaque mois à la date anniversaire de la souscription, par l'intermédiaire du prestataire de paiement sécurisé **Stripe** (Stripe Payments Europe, Ltd., Irlande). Les données de carte sont transmises directement à Stripe : l'Éditeur n'y a jamais accès et ne les conserve pas.",
        "En cas d'échec du prélèvement, le Client en est informé par e-mail et de nouvelles tentatives sont effectuées. À défaut de paiement 15 jours après l'échéance, la fiche peut être masquée jusqu'à régularisation, après information du Client.",
        "Conformément à l'article L. 441-10 du Code de commerce, toute somme impayée à l'échéance entraîne de plein droit des **pénalités de retard** égales à trois fois le taux d'intérêt légal, ainsi qu'une **indemnité forfaitaire pour frais de recouvrement de 40 €**. Aucun escompte n'est accordé pour paiement anticipé.",
      ],
    },
    {
      id: "duree",
      title: "Durée et tacite reconduction",
      icon: Repeat,
      blocks: [
        "L'abonnement est conclu pour une durée d'**un mois**, à compter de la souscription. Il est ensuite **reconduit tacitement** chaque mois pour une nouvelle durée d'un mois, sauf résiliation.",
      ],
    },
    {
      id: "resiliation",
      title: "Résiliation en un clic",
      icon: CircleX,
      blocks: [
        "Le Client peut résilier à tout moment, **en un clic depuis son espace restaurateur** (onglet « Ma fiche », rubrique « Abonnement »). Une confirmation de résiliation lui est adressée par e-mail.",
        "La résiliation prend effet à la fin de la période mensuelle en cours, déjà payée : la fiche reste publiée jusqu'à cette date, puis est masquée. Aucun nouveau prélèvement n'a lieu. Le mois commencé n'est pas remboursé au prorata.",
        "Le Client peut se réabonner à tout moment ; s'il supprime son compte, sa fiche et ses contenus sont effacés.",
        "L'Éditeur peut résilier l'abonnement en cas de manquement grave du Client aux CGU ou aux CGV (contenus illicites, informations trompeuses, impayé persistant), après une mise en demeure restée sans effet pendant 8 jours, sauf urgence ou obligation légale.",
      ],
    },
    {
      id: "retractation",
      title: "Droit de rétractation",
      icon: Undo2,
      blocks: [
        "L'abonnement est conclu entre professionnels, pour les besoins de l'activité de restauration du Client. Le droit de rétractation prévu par le Code de la consommation, réservé aux consommateurs, **ne s'applique pas**.",
        "L'extension prévue par l'article L. 221-3 du Code de la consommation en faveur de certains professionnels (cinq salariés au plus) ne vise que les contrats conclus hors établissement dont l'objet n'entre pas dans le champ de leur activité principale ; elle ne concerne pas un abonnement souscrit à distance pour promouvoir l'établissement.",
        "Le Client reste libre de résilier à tout moment, sans frais, dans les conditions de l'article « Résiliation en un clic ».",
      ],
    },
    {
      id: "facturation",
      title: "Facturation et déductibilité",
      icon: FileCheck,
      blocks: [
        "Une **facture** est émise à chaque paiement et adressée par e-mail ; elle reste téléchargeable depuis l'espace restaurateur. Elle mentionne notamment l'identité des parties, le numéro SIRET du Client, la période facturée, le prix hors taxes et le régime de TVA applicable.",
        "L'abonnement est une dépense engagée dans l'intérêt de l'exploitation : il constitue en principe une **charge déductible** du résultat professionnel, et la TVA facturée est récupérable par le Client assujetti, selon son régime fiscal. Ces indications sont générales et ne constituent pas un conseil fiscal : le Client est invité à se rapprocher de son expert-comptable.",
        "Les factures sont conservées par l'Éditeur pendant dix ans, conformément à ses obligations comptables.",
      ],
    },
    {
      id: "obligations",
      title: "Obligations du Client",
      icon: Handshake,
      blocks: [
        "Le Client s'engage à fournir des informations exactes (identité, SIRET, coordonnées de facturation) et à les tenir à jour, à publier des contenus exacts et licites dont il détient les droits, et à proposer réellement les promotions annoncées, conformément aux {{CGU|/legal/cgu}}.",
      ],
    },
    {
      id: "responsabilite",
      title: "Disponibilité et responsabilité",
      icon: Hourglass,
      blocks: [
        "L'Éditeur met en œuvre les moyens raisonnables pour assurer l'accès au service (obligation de moyens). Des interruptions peuvent survenir pour maintenance ou en cas d'incident chez ses prestataires ; une interruption de plus de 72 heures consécutives due à l'Éditeur donne lieu, sur demande, à un avoir au prorata.",
        "La responsabilité de l'Éditeur ne peut être engagée qu'en cas de faute prouvée et est limitée, tous préjudices confondus, aux sommes payées par le Client au cours des douze derniers mois. L'Éditeur ne garantit aucun volume de visites ou de chiffre d'affaires. Aucune des parties n'est responsable d'un manquement dû à un cas de force majeure (article 1218 du Code civil).",
      ],
    },
    {
      id: "donnees",
      title: "Données personnelles",
      icon: ShieldCheck,
      blocks: [
        "Les données du Client et de ses interlocuteurs sont traitées conformément à la {{politique de confidentialité|/legal/confidentialite}}. Les statistiques fournies au Client ne comportent que des totaux anonymes : il ne peut identifier ni les clients qui consultent sa fiche ni ses abonnés.",
      ],
    },
    {
      id: "litiges",
      title: "Modification des CGV, droit applicable et litiges",
      icon: Gavel,
      blocks: [
        "L'Éditeur peut modifier les CGV ; la nouvelle version est communiquée par e-mail au moins 30 jours avant son entrée en vigueur, le Client pouvant résilier sans frais avant cette date.",
        `Les CGV sont soumises au droit français. Les parties recherchent d'abord une solution amiable (${mail}). À défaut, tout litige relatif à leur formation, leur exécution ou leur interprétation relève de la compétence exclusive du **tribunal de commerce de ${LEGAL.courtCity}**, y compris en cas de pluralité de défendeurs ou d'appel en garantie.`,
      ],
    },
  ],
};
