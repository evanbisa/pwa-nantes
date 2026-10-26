import type { Metadata } from "next";
import LegalDocument from "@/components/legal/LegalDocument";
import { cgu } from "@/lib/legal";

export const metadata: Metadata = { title: cgu.title, description: cgu.summary };

export default function Page() {
  return <LegalDocument doc={cgu} />;
}
