import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";
import { mentionsLegales } from "@/lib/legal";

export const metadata: Metadata = { title: mentionsLegales.title, description: mentionsLegales.summary };

export default function Page() {
  return <LegalDocument doc={mentionsLegales} />;
}
