import { Building2, Copyright, Database, Mail, Server, ShieldCheck } from "lucide-react";
import { LEGAL } from "./site";
import type { LegalDoc } from "./types";

/** Mentions légales : article 6, III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN). */
export const mentionsLegales: LegalDoc = {
  slug: "mentions-legales",
  title: "Mentions légales",
  short: "Mentions légales",
  icon: Building2,
  summary: "Qui édite FlashMiam, qui l'héberge et comment nous joindre.",
  updated: LEGAL.updated,
  sections: [
    {
      id: "editeur",
      title: "Éditeur du site",
      icon: Building2,
      blocks: [
        "Le site et l'application **FlashMiam** sont édités par :",
        {
          facts: [
            ["Éditeur", LEGAL.editorName],
            ["Forme juridique", LEGAL.legalForm],
            ["Capital social", LEGAL.shareCapital],
            ["Adresse du siège", LEGAL.address],
            ["SIREN", LEGAL.siren],
            ["SIRET", LEGAL.siret],
            ["Immatriculation", LEGAL.registration],
            ["TVA intracommunautaire", LEGAL.vatNumber],
            ["Téléphone", LEGAL.phone],
            ["E-mail", `{{${LEGAL.email}|mailto:${LEGAL.email}}}`],
          ],
        },
      ],
    },
    {
      id: "directeur-publication",
      title: "Directeur de la publication",
      icon: ShieldCheck,
      blocks: [
        `Le directeur de la publication est **${LEGAL.publicationDirector}**, joignable à l'adresse {{${LEGAL.email}|mailto:${LEGAL.email}}}.`,
      ],
    },
    {
      id: "hebergement",
      title: "Hébergement du site",
      icon: Server,
      blocks: [
        "Le site est hébergé par :",
        {
          facts: [
            ["Hébergeur", "Vercel Inc."],
            ["Adresse", "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis"],
            ["Site internet", "{{vercel.com|https://vercel.com}}"],
          ],
        },
        "Une copie de secours du site est publiée par GitHub, Inc. (88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis — {{github.com|https://github.com}}).",
      ],
    },
    {
      id: "donnees",
      title: "Base de données et comptes",
      icon: Database,
      blocks: [
        "Les comptes, fiches des restaurants, photos, avis et statistiques sont conservés par **Supabase Inc.** ({{supabase.com|https://supabase.com}}), dans un centre de données situé à **Stockholm (Suède), dans l'Union européenne**.",
        "Le détail des données traitées et de vos droits figure dans la {{politique de confidentialité|/legal/confidentialite}}.",
      ],
    },
    {
      id: "propriete-intellectuelle",
      title: "Propriété intellectuelle",
      icon: Copyright,
      blocks: [
        "La marque FlashMiam, le logo, la présentation du site et son code sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou réutilisation sans autorisation écrite de l'éditeur est interdite.",
        "Les fonds de carte proviennent d'**OpenStreetMap** et de ses contributeurs (licence ODbL), via OpenFreeMap. Les contenus publiés par les restaurateurs (photos, menus, stories) restent leur propriété.",
      ],
    },
    {
      id: "contact",
      title: "Contact et signalement",
      icon: Mail,
      blocks: [
        `Pour toute question, ou pour signaler un contenu que vous estimez illicite, écrivez à {{${LEGAL.email}|mailto:${LEGAL.email}}} en précisant l'adresse de la page ou la fiche concernée et la raison du signalement. Un restaurateur peut aussi signaler un avis laissé sur sa fiche directement depuis son espace.`,
      ],
    },
  ],
};
