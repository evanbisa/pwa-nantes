import { Clock, Cookie, Database, Globe, Lock, Scale, ShieldCheck, UserCheck, Users } from "lucide-react";
import { LEGAL } from "./site";
import type { LegalDoc } from "./types";

const mail = `{{${LEGAL.email}|mailto:${LEGAL.email}}}`;

/**
 * Politique de confidentialité (RGPD et loi Informatique et Libertés).
 * Les durées de conservation sont celles appliquées chaque nuit par la fonction serveur « purge »
 * (web/supabase/functions/purge/handler.ts) : à modifier ensemble.
 */
export const confidentialite: LegalDoc = {
  slug: "confidentialite",
  title: "Politique de confidentialité",
  short: "Confidentialité",
  icon: ShieldCheck,
  summary: "Quelles données nous traitons, pourquoi, combien de temps, et comment exercer vos droits.",
  updated: LEGAL.updated,
  sections: [
    {
      id: "responsable",
      title: "Responsable du traitement",
      icon: UserCheck,
      blocks: [
        `Le responsable du traitement de vos données est **${LEGAL.editorName}**, ${LEGAL.address} (voir les {{mentions légales|/legal/mentions-legales}}).`,
        `Pour toute question sur vos données ou pour exercer vos droits : ${mail}.`,
        "FlashMiam applique un principe simple : **ne collecter que le nécessaire**. Pas de publicité, pas de revente de données, et les restaurateurs ne voient jamais qui consulte leur fiche.",
      ],
    },
    {
      id: "donnees",
      title: "Données traitées, finalités et bases légales",
      icon: Database,
      blocks: [
        {
          rows: [
            {
              title: "Compte : prénom, adresse e-mail, mot de passe",
              detail: "Créer et sécuriser votre compte. Le mot de passe n'est jamais conservé en clair. Pour un client, l'adresse est relue et son domaine vérifié (seul le domaine, ex. « gmail.com », est contrôlé) ; un restaurateur confirme la sienne par un code.",
              basis: "Exécution du contrat (CGU)",
            },
            {
              title: "Connexion avec Google : prénom, e-mail, identifiant Google",
              detail: "Créer votre compte et vous connecter sans mot de passe, si vous choisissez ce mode.",
              basis: "Exécution du contrat",
            },
            {
              title: "Sexe et année de naissance (facultatifs)",
              detail: "Réserver le service aux 15 ans et plus, et montrer aux restaurateurs le profil de leur public en totaux (« 60 % de femmes », « 18-24 ans »), seulement à partir de 5 personnes. Personne ne voit votre sexe ni votre âge.",
              basis: "Consentement, modifiable ou retirable dans Profil › Vous",
            },
            {
              title: "Position (si vous l'autorisez)",
              detail: "Afficher les distances et temps de trajet. Elle reste sur votre appareil : FlashMiam ne l'enregistre jamais.",
              basis: "Consentement, retirable à tout moment",
            },
            {
              title: "Restaurants suivis, notifications et alertes",
              detail: "Vous prévenir des promotions et stories des restaurants suivis, des réponses à vos avis ; alertes sur l'appareil si vous les activez (adresse technique fournie par votre navigateur).",
              basis: "Exécution du contrat ; consentement pour les alertes",
            },
            {
              title: "Avis : note, commentaire, date, prénom et initiale",
              detail: "Partager votre expérience ; le restaurateur peut y répondre. L'identifiant de votre compte n'est jamais affiché : vos avis ne peuvent pas être reliés entre eux.",
              basis: "Consentement (vous choisissez de publier)",
            },
            {
              title: "« J'aime » sur un plat ou une story",
              detail: "Afficher le nombre de « j'aime ». Seuls des totaux sont visibles, jamais les noms.",
              basis: "Consentement (retirable en un clic)",
            },
            {
              title: "Statistiques de fréquentation des fiches",
              detail: "Vues, provenance (carte, recherche, story…), menu et photos consultés, itinéraires, appels, partages, clics sur une offre ou une story. Elles fournissent aux restaurateurs des totaux ; votre compte sert seulement à ne vous compter qu'une fois.",
              basis: "Consentement (choix des cookies)",
            },
            {
              title: "Restaurateurs : nom, téléphone, SIRET, justificatifs, fiche",
              detail: "Vérifier l'établissement (répertoire Sirene de l'INSEE), publier sa fiche, gérer l'abonnement. Les justificatifs ne sont visibles que par le restaurateur et l'équipe de vérification.",
              basis: "Exécution du contrat ; obligations légales (facturation)",
            },
            {
              title: "Inscription : empreinte de l'adresse IP",
              detail: "Limiter les créations de comptes en masse depuis une même connexion. L'adresse IP elle-même n'est jamais enregistrée, seulement une empreinte irréversible.",
              basis: "Intérêt légitime (sécurité du service)",
            },
          ],
        },
      ],
    },
    {
      id: "destinataires",
      title: "Destinataires et sous-traitants",
      icon: Users,
      blocks: [
        "Vos données ne sont ni vendues ni louées. Elles ne sont accessibles qu'à l'éditeur et aux prestataires strictement nécessaires au service, qui agissent sur ses instructions :",
        {
          list: [
            "**Supabase** : comptes, données et fichiers, hébergés à Stockholm (Union européenne) ; envoi des codes par e-mail.",
            "**Vercel** (et GitHub pour la copie de secours) : hébergement des pages du site.",
            "**Google** : connexion avec Google, uniquement si vous l'utilisez et l'acceptez.",
            "**Cloudflare** (service DNS 1.1.1.1) : vérification que le domaine d'une adresse e-mail reçoit des e-mails ; seul le domaine est transmis.",
            "**Service d'alertes de votre navigateur** (Google, Mozilla, Apple ou Microsoft) : acheminement des alertes, chiffrées de bout en bout.",
            "**INSEE** (vérification du SIRET) et **IGN** (recherche d'adresse) : uniquement pour les restaurateurs.",
            "**Whop** : paiement de l'abonnement des restaurateurs (page de paiement, moyen de paiement, reçus), dès l'ouverture des abonnements payants. Les données de carte ne transitent que par Whop et ses prestataires de paiement ; FlashMiam ne reçoit que l'état de l'abonnement (formule, échéance, résiliation).",
            "**OpenFreeMap / OpenStreetMap** : fond de carte, chargé sans cookie.",
          ],
        },
        "Les fiches publiées (avec leurs photos, stories et promotions) et les avis sont publics par nature.",
      ],
    },
    {
      id: "transferts",
      title: "Transferts hors de l'Union européenne",
      icon: Globe,
      blocks: [
        "Les données des comptes sont conservées dans l'Union européenne. Certains prestataires (Vercel, Google, Cloudflare, Whop) sont établis aux États-Unis : les transferts éventuels sont encadrés par le cadre de protection des données UE–États-Unis (Data Privacy Framework) auquel ils adhèrent, ou par les clauses contractuelles types de la Commission européenne.",
      ],
    },
    {
      id: "durees",
      title: "Durées de conservation",
      icon: Clock,
      blocks: [
        {
          callout: "Ces durées sont **appliquées automatiquement** : un ménage efface chaque nuit tout ce qui les a dépassées.",
          tone: "info",
        },
        {
          rows: [
            { title: "Notifications", detail: "60 jours au maximum." },
            { title: "Statistiques liées à une personne", detail: "90 jours au maximum (fiche consultée, provenance, action, story vue, offre ouverte)." },
            { title: "Totaux quotidiens des restaurants", detail: "6 mois ; ils ne contiennent aucune donnée personnelle." },
            { title: "Stories", detail: "Publiques 24 heures, puis visibles par leur seul restaurateur ; supprimées avec leur photo 30 jours après leur fin." },
            { title: "Tentatives d'inscription (empreinte IP)", detail: "2 jours." },
            { title: "Notifications de paiement reçues de Whop", detail: "30 jours (identifiant et type seulement)." },
            { title: "Compte, fiche, avis, « j'aime »", detail: "Jusqu'à leur suppression par vous, ou la suppression du compte." },
            { title: "Alertes sur l'appareil", detail: "Jusqu'à leur désactivation, la déconnexion ou la suppression du compte." },
            { title: "Factures des restaurateurs", detail: "10 ans (obligation comptable)." },
          ],
        },
      ],
    },
    {
      id: "securite",
      title: "Sécurité",
      icon: Lock,
      blocks: [
        "Connexions chiffrées (HTTPS), mots de passe conservés sous forme d'empreinte, règles d'accès en base de données (chacun n'accède qu'à ses propres données), protection contre l'injection de scripts, vérifications automatiques régulières et suppression complète des fichiers à la suppression d'un compte.",
      ],
    },
    {
      id: "droits",
      title: "Vos droits",
      icon: Scale,
      blocks: [
        "Vous disposez à tout moment des droits suivants sur vos données :",
        {
          list: [
            "**Accès** et **rectification** : vos informations sont visibles et modifiables dans votre profil ;",
            "**Suppression en un clic** : le bouton « Supprimer mon compte » de votre profil efface immédiatement votre compte et tout ce qui lui est lié (fiche, photos, avis, abonnements, statistiques) ;",
            "**Retrait du consentement** (cookies de statistiques, sexe et âge, localisation, alertes), sans effet sur les traitements passés ;",
            "**Opposition**, **limitation** et **portabilité** de vos données ;",
            "**Directives** sur le sort de vos données après votre décès.",
          ],
        },
        `Pour toute demande qui ne peut pas être faite depuis le profil, écrivez à ${mail} ; une réponse vous est apportée dans un délai d'**un mois**. Une preuve d'identité peut être demandée en cas de doute raisonnable.`,
        "Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la **CNIL** ({{cnil.fr|https://www.cnil.fr}}).",
        "FlashMiam est réservé aux personnes de 15 ans et plus.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies et stockage local",
      icon: Cookie,
      blocks: [
        "À votre première visite, FlashMiam vous demande votre choix. **Refuser est aussi simple qu'accepter**, et le site fonctionne dans les deux cas. Vous pouvez changer d'avis à tout moment depuis Profil › Cookies ; votre choix est conservé 6 mois, puis redemandé.",
        {
          rows: [
            {
              title: "Indispensables (sans consentement)",
              detail: "Stockage local du navigateur pour la session de connexion, vos préférences (thème, localisation, alertes), votre choix de cookies et une copie des fiches publiques (3 jours au plus) pour afficher la carte même hors connexion.",
              basis: "Toujours actifs",
            },
            {
              title: "Statistiques de fréquentation",
              detail: "Vos visites et actions sur les fiches sont comptées pour fournir des totaux aux restaurateurs. Sans accord, rien n'est envoyé.",
              basis: "Avec votre accord",
            },
            {
              title: "Services Google (préférence de connexion)",
              detail: "Le bouton « Continuer avec Google » charge un script de Google, qui peut déposer ses propres cookies. Sans accord, il n'est pas chargé.",
              basis: "Avec votre accord",
            },
          ],
        },
        "Aucun cookie publicitaire n'est utilisé. Les polices et la bibliothèque de carte sont servies par FlashMiam lui-même.",
      ],
    },
  ],
};
