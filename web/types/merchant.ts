import type { LatLng } from "@/lib/geo/config";

/** Catégories : identiques à l'enum `merchant_category` de la base. */
export const CATEGORIES = {
  food_truck: { label: "Food-truck", emoji: "🚚" },
  kebab: { label: "Kebab", emoji: "🥙" },
  burger: { label: "Burger", emoji: "🍔" },
  sweets: { label: "Sweets", emoji: "🧁" },
  pizza: { label: "Pizza", emoji: "🍕" },
  other: { label: "Autre restauration", emoji: "🍽️" },
} as const;

export type MerchantCategory = keyof typeof CATEGORIES;

/** Ce dont la carte a besoin pour afficher un commerce (sous-ensemble de la table `merchants`). */
export interface MapMerchant {
  id: string;
  name: string;
  category: MerchantCategory;
  position: LatLng;
  /** Ouvert en ce moment (calculé à partir des horaires). */
  openNow: boolean;
  /** Commerce inscrit et vérifié (SIRET contrôlé). */
  verified?: boolean;
}
