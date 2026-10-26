import type { LucideIcon } from "lucide-react";

/**
 * Texte enrichi des documents juridiques (voir components/legal/RichText.tsx) :
 *   **gras**, {{libellé|lien}} (lien interne « /legal/… » ou adresse complète),
 *   [À_COMPLÉTER] : information à remplacer, surlignée tant qu'elle n'est pas renseignée (lib/legal/site.ts).
 */
export type Rich = string;

export type Block =
  | Rich // paragraphe
  | { list: Rich[]; ordered?: boolean }
  | { callout: Rich; tone?: "info" | "warning" }
  | { facts: [Rich, Rich][] } // couples « libellé : valeur » (identité, coordonnées…)
  | { rows: { title: Rich; detail: Rich; basis?: Rich }[] }; // tableau en cartes (données, durées…)

export interface Section {
  /** Ancre de l'article (sommaire, liens « #… ») */
  id: string;
  title: string;
  icon: LucideIcon;
  blocks: Block[];
}

export interface LegalDoc {
  slug: "mentions-legales" | "cgu" | "cgv" | "confidentialite";
  /** Nom complet (titre de la page) */
  title: string;
  /** Nom court (onglets) */
  short: string;
  icon: LucideIcon;
  /** Une phrase : à quoi sert ce document */
  summary: string;
  updated: string;
  /** Avertissement affiché en tête (ex. CGV pas encore en vigueur) */
  notice?: Rich;
  sections: Section[];
}
