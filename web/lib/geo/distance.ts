import type { LatLng } from "./config";

const EARTH_RADIUS_M = 6_371_000;
/** Vitesse de marche moyenne, en mètres par minute (≈ 4,8 km/h). */
const WALK_SPEED_M_PER_MIN = 80;
/** Vitesse moyenne en voiture en ville, feux compris (≈ 25 km/h), et allongement moyen de la route. */
const DRIVE_SPEED_M_PER_MIN = 420;
const ROAD_DETOUR = 1.3;

/** Distance à vol d'oiseau (formule de haversine), en mètres. */
export function distanceMeters([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** « 350 m », « 1,2 km » */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

/** Temps de marche arrondi à la minute (1 min au minimum). */
export const walkingMinutes = (meters: number) => Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN));

/** Temps en voiture estimé, arrondi à la minute (1 min au minimum). */
export const drivingMinutes = (meters: number) => Math.max(1, Math.round((meters * ROAD_DETOUR) / DRIVE_SPEED_M_PER_MIN));

/** Itinéraire dans Google Maps, à pied ou en voiture (ouvre l'application sur téléphone). */
export const directionsUrl = ([lat, lng]: LatLng, mode: "walking" | "driving" = "walking") =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode}`;
