import type { Metadata } from "next";
import TeamRestaurants from "@/components/dashboard/restaurants";
import { THEME_SCRIPT } from "@/lib/legal/theme";

export const metadata: Metadata = {
  title: "Restaurants · FlashMiam",
  description: "Restaurants inscrits sur FlashMiam, réservé à l'équipe.",
  robots: { index: false, follow: false },
};

/** Restaurants inscrits (liste) et fiche complète d'un restaurant (?id=…), pour l'équipe. */
export default function RestaurantsPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <TeamRestaurants />
    </>
  );
}
