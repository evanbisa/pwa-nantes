import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";
import { confidentialite } from "@/lib/legal";

export const metadata: Metadata = { title: confidentialite.title, description: confidentialite.summary };

export default function Page() {
  return <LegalDocument doc={confidentialite} />;
}
