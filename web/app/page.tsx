import type { Metadata } from "next";
import GoToMap from "@/components/home/GoToMap";

/** /app/ : renvoie vers la carte (site principal, index.html). */
export const metadata: Metadata = { robots: { index: false } };

export default function Home() {
  return <GoToMap />;
}
