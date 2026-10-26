import { cgu } from "./cgu";
import { cgv } from "./cgv";
import { confidentialite } from "./confidentialite";
import { mentionsLegales } from "./mentions-legales";
import type { LegalDoc } from "./types";

/** Documents juridiques, dans l'ordre de la navigation. */
export const LEGAL_DOCS: LegalDoc[] = [mentionsLegales, cgu, cgv, confidentialite];

export { cgu, cgv, confidentialite, mentionsLegales };
export type { LegalDoc };
