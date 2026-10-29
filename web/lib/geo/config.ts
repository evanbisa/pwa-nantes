/**
 * Périmètre géographique : La Roche-sur-Yon et sa couronne.
 * Les limites sont les mêmes que la contrainte `in_service_area` de la base (migration Supabase).
 */

export type LatLng = [lat: number, lng: number];

/** Centre-ville (place Napoléon). */
export const CITY_CENTER: LatLng = [46.6705, -1.4264];

/** Zone de service : la carte ne peut pas en sortir, et les adresses hors zone sont refusées. */
export const SERVICE_BOUNDS: [southWest: LatLng, northEast: LatLng] = [
  [46.6, -1.56],
  [46.74, -1.3],
];

export const ZOOM = {
  initial: 14, // centre-ville et campus visibles sur un téléphone
  min: 12,
  max: 19,
  focus: 17, // zoom appliqué à l'ouverture d'une fiche
  user: 16, // zoom sur la position de l'utilisateur
} as const;

/** Code INSEE de La Roche-sur-Yon : limite la recherche d'adresses de la BAN à la commune. */
export const CITY_INSEE_CODE = "85191";
export const CITY_NAME = "La Roche-sur-Yon";

export const isInServiceArea = ([lat, lng]: LatLng) =>
  lat >= SERVICE_BOUNDS[0][0] && lat <= SERVICE_BOUNDS[1][0] && lng >= SERVICE_BOUNDS[0][1] && lng <= SERVICE_BOUNDS[1][1];

export type MapTheme = "day" | "night";

/**
 * Fonds de carte raster (Leaflet). Par défaut : CARTO Voyager (jour) et Dark Matter (nuit),
 * données © OpenStreetMap. Pour un usage commercial à fort trafic, prévoir une offre payante
 * (CARTO, MapTiler, Stadia…) et renseigner les URL dans les variables d'environnement.
 */
export const TILES: Record<MapTheme, { url: string; attribution: string }> = {
  day: {
    url: process.env.NEXT_PUBLIC_MAP_TILES_DAY ?? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  night: {
    url: process.env.NEXT_PUBLIC_MAP_TILES_NIGHT ?? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};
