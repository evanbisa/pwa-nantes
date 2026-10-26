import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";
import { cgv } from "@/lib/legal";

export const metadata: Metadata = { title: cgv.title, description: cgv.summary };

export default function Page() {
  return <LegalDocument doc={cgv} />;
}
