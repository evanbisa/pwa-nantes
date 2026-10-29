/**
 * Logique de vérification d'un SIRET (sans accès réseau ni base : testable seule).
 * Reprise du prototype : contrôle de Luhn, répertoire Sirene, codes NAF de restauration.
 */

/** Codes NAF acceptés : restauration, débits de boissons, boulangerie / pâtisserie, glaces, vente ambulante. */
export const NAF_RESTAURATION: Record<string, string> = {
  "56.10A": "Restauration traditionnelle",
  "56.10B": "Cafétérias et autres libres-services",
  "56.10C": "Restauration de type rapide",
  "56.21Z": "Services des traiteurs",
  "56.30Z": "Débits de boissons",
  "10.71C": "Boulangerie et boulangerie-pâtisserie",
  "10.71D": "Pâtisserie",
  "10.52Z": "Fabrication de glaces et sorbets",
  "47.24Z": "Commerce de détail de pain, pâtisserie et confiserie",
  "47.81Z": "Commerce de détail alimentaire sur éventaires et marchés",
};

export const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Clé de contrôle du SIRET : algorithme de Luhn (exception : établissements de La Poste). */
export function isValidSiret(siret: string): boolean {
  if (!/^\d{14}$/.test(siret)) return false;
  if (siret.startsWith("356000000")) return [...siret].reduce((a, c) => a + Number(c), 0) % 5 === 0;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(siret[13 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Zone de service (identique à public.in_service_area) */
export const inServiceArea = (lat: number, lng: number) => lat >= 46.6 && lat <= 46.74 && lng >= -1.56 && lng <= -1.3;

/** Adresse de l'API Recherche d'entreprises (base remplaçable pour les tests : variable SIRENE_API_URL). */
export const sireneUrl = (siret: string, base = "https://recherche-entreprises.api.gouv.fr/search") =>
  `${base}?q=${siret}&limite_matching_etablissements=1`;

export interface Company {
  siret: string;
  legalName: string;
  tradeName: string | null;
  naf: string;
  nafLabel: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export type CheckResult =
  | { ok: true; company: Company; snapshot: unknown }
  | { ok: false; status: number; code: string; message: string };

const fail = (status: number, code: string, message: string): CheckResult => ({ ok: false, status, code, message });

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_m, p: string, c: string) => p + c.toUpperCase());

/** Analyse la réponse de l'API Recherche d'entreprises pour un SIRET donné. */
export function checkSireneResponse(siret: string, body: unknown): CheckResult {
  const results = (body as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) return fail(502, "sirene_format", "Réponse inattendue du répertoire Sirene.");
  for (const unit of results as Record<string, any>[]) {
    const etab = (unit.matching_etablissements ?? []).find((e: Record<string, any>) => e?.siret === siret);
    if (!etab) continue;
    if (etab.etat_administratif !== "A") {
      return fail(422, "closed", "Cet établissement est fermé (répertoire Sirene).");
    }
    const naf = String(etab.activite_principale ?? unit.activite_principale ?? "");
    if (!NAF_RESTAURATION[naf]) {
      return fail(422, "naf", `Activité « ${naf || "inconnue"} » : ce n'est pas une activité de restauration.`);
    }
    const lat = Number.parseFloat(etab.latitude);
    const lng = Number.parseFloat(etab.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && inServiceArea(lat, lng);
    const enseigne = Array.isArray(etab.liste_enseignes) && etab.liste_enseignes[0] ? String(etab.liste_enseignes[0]) : null;
    const legalName = String(unit.nom_complet ?? unit.nom_raison_sociale ?? "").trim();
    return {
      ok: true,
      company: {
        siret,
        legalName: legalName.slice(0, 200),
        tradeName: enseigne ? titleCase(enseigne).slice(0, 80) : null,
        naf,
        nafLabel: NAF_RESTAURATION[naf],
        address: etab.adresse ? String(etab.adresse).slice(0, 200) : null,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
      },
      snapshot: { unit: { siren: unit.siren, nom_complet: unit.nom_complet }, etablissement: etab },
    };
  }
  return fail(404, "not_found", "SIRET introuvable dans le répertoire Sirene.");
}

/** Nom de la fiche : enseigne, sinon raison sociale (2 à 80 caractères, comme la base). */
export function merchantName(c: Company): string {
  const name = (c.tradeName || titleCase(c.legalName) || "Mon restaurant").replace(/\s+/g, " ").trim().slice(0, 80);
  return name.length >= 2 ? name : "Mon restaurant";
}
