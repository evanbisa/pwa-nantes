import {
  Calculator, CircleX, CreditCard, FileCheck, Gavel, Handshake, Hourglass, Info, Receipt, Repeat, ShieldCheck, Undo2,
} from "lucide-react";
import { LEGAL } from "./site";
import type { LegalDoc } from "./types";

const mail = `{{${LEGAL.email}|mailto:${LEGAL.email}}}`;
const { essentiel, premium } = LEGAL.plans;

/** Conditions générales de vente : abonnement des restaurateurs (contrat entre professionnels). */
export const cgv: LegalDoc = {
  slug: "cgv",
  title: "Conditions générales de vente",
  short: "CGV",
  icon: Receipt,
  summary: `Les abonnements des restaurateurs : ${essentiel.name} (${essentiel.month} par mois), ${premium.name} (${premium.month} par mois) ou sur devis, au mois ou à l'année, sans engagement.`,
  updated: LEGAL.updated,
  notice: `Ces conditions s'appliquent aux abonnements souscrits à compter du ${LEGAL.cgvEffectiveDate}, date d'ouverture des abonnements payants.`,
  sections: [
    {
      id: "champ",
      title: "Champ d'application",
      icon: Info,
      blocks: [
        `Les présentes conditions générales de vente (« CGV ») régissent les abonnements **FlashMiam Pro** (formules ${essentiel.name}, ${premium.name} et sur devis) souscrits par un restaurateur (le « Client ») auprès de ${LEGAL.editorName} (l'« Éditeur », voir les {{mentions légales|/legal/mentions-legales}}).`,
        "L'abonnement est réservé aux **professionnels** agissant pour les besoins de leur activité de restauration, identifiés par un numéro SIRET vérifié. Les présentes CGV constituent le socle de la négociation commerciale au sens de l'article L. 441-1 du Code de commerce.",
        "Elles sont acceptées en cochant la case prévue lors de la souscription et prévalent sur tout autre document du Client. Les {{conditions générales d'utilisation|/legal/cgu}} s'appliquent également.",
      ],
    },
    {
      id: "offre",
      title: "Contenu de l'abonnement",
      icon: ShieldCheck,
      blocks: [
        "Toutes les formules comprennent, pendant toute leur durée :",
        {
          list: [
            "la publication de la fiche de l'établissement sur la carte et dans la liste (description, menu et prix, photos, horaires, adresse) ;",
            "la publication de stories (24 heures) et de promotions, avec notification des clients abonnés à l'établissement ;",
            "les statistiques de fréquentation de la fiche, en totaux anonymes (vues, provenance, interactions, public) ;",
            "la réponse aux avis des clients et leur signalement.",
          ],
        },
        `La formule **${premium.name}** ajoute les avantages décrits sur la page de souscription au moment de l'achat. La formule **sur devis** (plusieurs établissements, besoins particuliers) fait l'objet d'un devis accepté par le Client, dont les conditions particulières (contenu, prix, durée) prévalent sur les présentes CGV en cas de contradiction.`,
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
            [essentiel.name, `**${essentiel.month} par mois**, ou **${essentiel.year} par an**`],
            [premium.name, `**${premium.month} par mois**, ou **${premium.year} par an**`],
            ["Sur devis", "Prix fixé par le devis accepté"],
            ["TVA", LEGAL.vatMention],
            ["Engagement", "Aucun : abonnement au mois ou à l'année, résiliable à tout moment (effet à la fin de la période payée)"],
          ],
        },
        "Le prix applicable est celui affiché au moment de la souscription. L'Éditeur peut le modifier pour les périodes à venir en informant le Client par e-mail au moins **30 jours** à l'avance ; le Client qui refuse le nouveau prix peut résilier avant son application, sans frais.",
      ],
    },
    {
      id: "paiement",
      title: "Paiement par Whop",
      icon: CreditCard,
      blocks: [
        `Le paiement s'effectue par carte bancaire, d'avance, pour chaque période (mois ou année) à la date anniversaire de la souscription, sur la page de paiement sécurisée de la plateforme **Whop** (${LEGAL.paymentProvider}). Les données de carte sont saisies et conservées par Whop et ses prestataires de paiement : l'Éditeur n'y a jamais accès. La TVA éventuelle est indiquée sur la page de paiement, avant validation.`,
        "Le Client gère son moyen de paiement et retrouve ses reçus depuis son espace restaurateur (onglet « Ma fiche », rubrique « Abonnement », « Moyen de paiement et factures »).",
        "En cas d'échec du paiement, le Client en est averti dans son espace restaurateur et Whop effectue de nouvelles tentatives ; la fiche reste publiée pendant ce délai. Si le paiement n'aboutit pas, l'abonnement prend fin et la fiche est retirée de la carte jusqu'à la souscription d'un nouvel abonnement.",
        "Conformément à l'article L. 441-10 du Code de commerce, toute somme impayée à l'échéance entraîne de plein droit des **pénalités de retard** égales à trois fois le taux d'intérêt légal, ainsi qu'une **indemnité forfaitaire pour frais de recouvrement de 40 €**. Aucun escompte n'est accordé pour paiement anticipé.",
      ],
    },
    {
      id: "duree",
      title: "Durée et tacite reconduction",
      icon: Repeat,
      blocks: [
        "L'abonnement est conclu pour une durée d'**un mois** ou d'**un an**, selon la périodicité choisie, à compter de la souscription. Il est ensuite **reconduit tacitement** pour une nouvelle durée identique, sauf résiliation.",
        "Pour changer de formule ou de périodicité, le Client résilie l'abonnement en cours puis souscrit la nouvelle formule à son échéance, ou contacte l'Éditeur pour un changement immédiat.",
      ],
    },
    {
      id: "resiliation",
      title: "Résiliation en un clic",
      icon: CircleX,
      blocks: [
        "Le Client peut résilier à tout moment, **en un clic depuis son espace restaurateur** (onglet « Ma fiche », rubrique « Abonnement », « Résilier l'abonnement »). La résiliation est confirmée immédiatement à l'écran, avec sa date d'effet.",
        "La résiliation prend effet à la fin de la période en cours (mois ou année), déjà payée : la fiche reste publiée jusqu'à cette date, puis est retirée de la carte. Aucun nouveau prélèvement n'a lieu. La période commencée n'est pas remboursée au prorata, y compris pour un abonnement annuel. Jusqu'à cette date, le Client peut revenir sur sa décision (« Reprendre l'abonnement »).",
        "Le Client peut se réabonner à tout moment. La suppression de son compte arrête le renouvellement de l'abonnement et efface sa fiche et ses contenus.",
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
        `Un **reçu** est adressé par e-mail par Whop à chaque paiement et reste consultable depuis l'espace restaurateur (« Moyen de paiement et factures »). Une **facture** mentionnant notamment l'identité des parties, le numéro SIRET du Client, la période facturée, le prix hors taxes et le régime de TVA applicable est mise à sa disposition ; une copie peut être demandée à ${mail}.`,
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
