import {
  Ban, BadgeCheck, Camera, Copyright, FileText, Gavel, Info, MapPin, MessageSquareWarning, Pencil, Store, TriangleAlert, UserCheck,
} from "lucide-react";
import { LEGAL } from "./site";
import type { LegalDoc } from "./types";

const mail = `{{${LEGAL.email}|mailto:${LEGAL.email}}}`;

/** Conditions générales d'utilisation : clients et restaurateurs, service gratuit pour les clients. */
export const cgu: LegalDoc = {
  slug: "cgu",
  title: "Conditions générales d'utilisation",
  short: "CGU",
  icon: FileText,
  summary: "Les règles d'utilisation de FlashMiam, pour les clients comme pour les restaurateurs.",
  updated: LEGAL.updated,
  sections: [
    {
      id: "objet",
      title: "Objet et acceptation",
      icon: Info,
      blocks: [
        `Les présentes conditions générales d'utilisation (« CGU ») encadrent l'utilisation du site et de l'application **FlashMiam**, édités par ${LEGAL.editorName} (voir les {{mentions légales|/legal/mentions-legales}}).`,
        "En créant un compte, vous acceptez les CGU dans leur version en vigueur et attestez avoir 15 ans ou plus, en cochant la case prévue à cet effet ; la date et la version acceptées sont conservées avec votre compte. Sans compte, la consultation du site vaut également acceptation des présentes règles.",
        "Les restaurateurs qui souscrivent l'abonnement payant sont en outre soumis aux {{conditions générales de vente|/legal/cgv}}.",
      ],
    },
    {
      id: "service",
      title: "Le service FlashMiam",
      icon: MapPin,
      blocks: [
        "FlashMiam aide à trouver où manger à **La Roche-sur-Yon et dans son agglomération** : carte des food-trucks et commerces de restauration rapide, distance et temps de trajet depuis votre position, menus et prix, photos, promotions, stories, avis, recherche par plat et par budget, et notifications des restaurants que vous suivez.",
        "Le service est **gratuit pour les clients**. Il peut évoluer, être interrompu pour maintenance ou contenir des erreurs ; l'éditeur s'efforce de le rendre disponible en continu, sans pouvoir le garantir.",
        "La localisation n'est utilisée que si vous l'autorisez : elle reste sur votre appareil et sert seulement à calculer les distances.",
      ],
    },
    {
      id: "comptes",
      title: "Création et sécurité des comptes",
      icon: UserCheck,
      blocks: [
        "**Comptes clients (étudiants et grand public)** :",
        {
          list: [
            "FlashMiam est réservé aux personnes de **15 ans et plus**.",
            "Le compte se crée avec un prénom, une adresse e-mail et un mot de passe, ou avec « S'inscrire avec Google ». Le sexe et l'âge sont facultatifs et modifiables à tout moment.",
            "Vous relisez et confirmez votre adresse e-mail à l'inscription : elle sert à vous connecter et à récupérer votre compte. Une adresse inexacte peut vous empêcher d'y accéder.",
          ],
        },
        "**Comptes restaurateurs** :",
        {
          list: [
            "Réservés aux établissements de restauration en activité. L'adresse e-mail est confirmée par un code, puis le **numéro SIRET est vérifié** auprès du répertoire Sirene de l'INSEE (établissement actif, activité de restauration).",
            "Des justificatifs (extrait Kbis ou équivalent) peuvent être demandés avant la publication de la fiche. La personne qui crée le compte déclare sur l'honneur être habilitée à représenter l'établissement.",
            "Un SIRET ne peut être rattaché qu'à un seul compte.",
          ],
        },
        "**Pour tous** : un compte est personnel. Les informations fournies doivent être exactes et à jour. Vous êtes responsable de la confidentialité de votre mot de passe et de l'utilisation de votre compte ; signalez sans délai tout accès suspect. Vous pouvez supprimer votre compte à tout moment depuis votre profil (« Supprimer mon compte »).",
      ],
    },
    {
      id: "regles",
      title: "Règles de bonne conduite",
      icon: BadgeCheck,
      blocks: [
        "En utilisant FlashMiam, vous vous engagez à ne pas :",
        {
          list: [
            "publier de contenu illicite, injurieux, diffamatoire, discriminatoire, violent, pornographique ou portant atteinte à la vie privée ou à l'image d'autrui ;",
            "usurper l'identité d'une personne ou d'un établissement, ou créer des comptes en masse ou automatisés ;",
            "publier de faux avis, ou des avis rédigés contre une contrepartie ;",
            "contourner les mesures de sécurité, extraire massivement les données du service ou perturber son fonctionnement ;",
            "utiliser FlashMiam à des fins publicitaires non autorisées (spam, démarchage).",
          ],
        },
      ],
    },
    {
      id: "avis",
      title: "Avis des clients et leur modération",
      icon: MessageSquareWarning,
      blocks: [
        "Les informations suivantes sont données conformément à l'article L. 111-7-2 du Code de la consommation.",
        {
          list: [
            "**Qui peut publier** : seuls les titulaires d'un compte client, à raison d'un avis par restaurant, modifiable ou supprimable à tout moment. Un restaurateur ne peut pas noter son propre établissement.",
            "**Contrôle** : les avis ne font pas l'objet d'une vérification préalable à leur publication ; FlashMiam ne vérifie pas que leur auteur a réellement consommé dans l'établissement. Ils sont contrôlés après publication, notamment à la suite d'un signalement.",
            "**Contrepartie** : aucun avis n'est rémunéré ni sollicité contre un avantage, par FlashMiam comme par les restaurateurs.",
            "**Classement** : les avis sont affichés du plus récent au plus ancien, avec leur date de publication ; la note moyenne tient compte de tous les avis publiés.",
            "**Contenu attendu** : un avis doit refléter une expérience réelle et rester courtois. Sont retirés : insultes, propos discriminatoires, informations personnelles sur des tiers, publicité, contenus sans rapport avec l'établissement, faux avis.",
            "**Réponse et signalement** : le restaurateur peut répondre publiquement et signaler un avis ; l'avis reste visible pendant son examen. Toute personne peut signaler un avis par e-mail.",
            `**Information de l'auteur** : en cas de retrait, l'auteur est informé du motif et peut le contester en écrivant à ${mail}.`,
          ],
        },
        "Les avis sont publics et affichés avec le prénom et l'initiale du nom de leur auteur, jamais avec l'identifiant de son compte.",
      ],
    },
    {
      id: "contenus",
      title: "Contenus des restaurateurs : fiches, photos, stories",
      icon: Camera,
      blocks: [
        "Le restaurateur est **seul responsable** des contenus qu'il publie : nom, description, menu, prix, horaires, photos, stories (publiées 24 heures) et promotions. Il garantit qu'ils sont exacts, qu'il en détient les droits (ou les autorisations nécessaires, notamment des personnes photographiées) et qu'ils respectent la loi.",
        "Les promotions affichées doivent être réellement proposées dans l'établissement, aux conditions et pendant la durée indiquées.",
        "Le restaurateur concède à l'éditeur, pour la durée de publication, le droit gratuit et non exclusif de reproduire et d'afficher ces contenus sur FlashMiam (carte, fiche, notifications, partages), dans le seul but de faire fonctionner le service.",
        "Seules les photos envoyées depuis FlashMiam sont acceptées ; elles peuvent être recadrées ou compressées pour l'affichage.",
      ],
    },
    {
      id: "moderation",
      title: "Modération, signalements et suspension",
      icon: Ban,
      blocks: [
        `Tout contenu illicite peut être signalé à ${mail} (adresse de la fiche ou du contenu, motif précis, coordonnées de l'auteur du signalement). Les signalements sont examinés dans les meilleurs délais, de manière objective.`,
        "Un contenu peut être retiré et un compte suspendu, temporairement ou définitivement, notamment en cas de :",
        {
          list: [
            "contenu illicite ou contraire aux présentes CGU ;",
            "faux avis, avis rémunérés ou manœuvres pour fausser les notes ou les statistiques ;",
            "informations trompeuses sur un établissement (fausse promotion, faux horaires, prix fantaisistes) ;",
            "usurpation d'identité, SIRET appartenant à un autre établissement ou établissement fermé ;",
            "atteinte à la sécurité du service ou utilisation automatisée ;",
            "pour un restaurateur, défaut de paiement de l'abonnement (voir les {{CGV|/legal/cgv}}).",
          ],
        },
        `Sauf urgence ou obligation légale, la personne concernée est informée de la mesure, de son motif et des faits qui la justifient. Elle peut la contester en écrivant à ${mail} ; sa réclamation est examinée par une personne, et la décision est revue si elle est fondée.`,
      ],
    },
    {
      id: "propriete-intellectuelle",
      title: "Propriété intellectuelle",
      icon: Copyright,
      blocks: [
        "La marque, le logo, la présentation et le code de FlashMiam appartiennent à l'éditeur. Vous bénéficiez d'un droit d'utilisation personnel et non commercial du service ; toute reproduction ou extraction substantielle du contenu ou des données est interdite.",
        "Les fonds de carte sont fournis par OpenStreetMap et ses contributeurs (licence ODbL) via OpenFreeMap. Les contenus des restaurateurs et les avis restent la propriété de leurs auteurs.",
      ],
    },
    {
      id: "responsabilite",
      title: "Informations affichées et responsabilité",
      icon: TriangleAlert,
      blocks: [
        {
          callout: "Horaires, ouvertures, prix, menus, stocks et promotions sont renseignés par les restaurateurs eux-mêmes. Un food-truck peut changer d'emplacement, un plat être épuisé, un établissement fermer exceptionnellement : en cas de doute, renseignez-vous auprès de l'établissement avant de vous déplacer.",
          tone: "warning",
        },
        "FlashMiam ne peut garantir l'exactitude de ces informations à tout moment, ni la disponibilité des produits. Les distances et temps de trajet sont des estimations. Les informations sur les allergènes ou la composition des plats doivent être demandées directement à l'établissement.",
        "L'éditeur n'est pas partie aux échanges entre clients et restaurateurs (commande, paiement, qualité des produits) et ne peut en être tenu responsable. Sa responsabilité ne peut être engagée qu'en cas de faute prouvée, dans les limites prévues par la loi ; elle n'est pas exclue en cas de dommage corporel ou de faute lourde.",
      ],
    },
    {
      id: "donnees",
      title: "Données personnelles et cookies",
      icon: Store,
      blocks: [
        "Le traitement de vos données, leurs durées de conservation et vos droits sont décrits dans la {{politique de confidentialité|/legal/confidentialite}}.",
      ],
    },
    {
      id: "modifications",
      title: "Évolution des CGU et fin d'utilisation",
      icon: Pencil,
      blocks: [
        "Les CGU peuvent évoluer, notamment pour suivre les évolutions du service ou de la loi. En cas de changement important, les titulaires d'un compte en sont informés avant son entrée en vigueur ; s'ils ne l'acceptent pas, ils peuvent supprimer leur compte.",
        "Vous pouvez cesser d'utiliser FlashMiam et supprimer votre compte à tout moment, sans frais.",
      ],
    },
    {
      id: "litiges",
      title: "Droit applicable et litiges",
      icon: Gavel,
      blocks: [
        `Les présentes CGU sont soumises au droit français. En cas de difficulté, contactez d'abord l'éditeur à ${mail} pour rechercher une solution amiable.`,
        `Si vous êtes consommateur, vous pouvez recourir gratuitement au médiateur de la consommation : ${LEGAL.consumerMediator}. À défaut d'accord, le litige est porté devant les tribunaux compétents selon les règles de droit commun.`,
      ],
    },
  ],
};
