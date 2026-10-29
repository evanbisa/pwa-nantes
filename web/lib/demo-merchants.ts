import type { MapMerchant } from "@/types/merchant";

/**
 * Commerces de démonstration repris du prototype, en attendant les fiches Supabase.
 * À supprimer une fois la table `merchants` alimentée.
 */
export const DEMO_MERCHANTS: MapMerchant[] = [
  { id: "camion-napoleon", name: "Le Camion Vendéen", category: "food_truck", position: [46.6705, -1.4274], openNow: true },
  { id: "kebab-clemenceau", name: "Kebab Clemenceau", category: "kebab", position: [46.6698, -1.4303], openNow: true },
  { id: "burger-halles", name: "Les Halles Burger", category: "burger", position: [46.6693, -1.4254], openNow: false, verified: true },
  { id: "gaufres-marche", name: "La Gaufrerie du Yon", category: "sweets", position: [46.67, -1.4237], openNow: true },
  { id: "truck-gare", name: "Gare Gourmande", category: "food_truck", position: [46.6719, -1.4345], openNow: false },
  { id: "smash-briand", name: "Smash Yon Burger", category: "burger", position: [46.6704, -1.4317], openNow: true, verified: true },
];
