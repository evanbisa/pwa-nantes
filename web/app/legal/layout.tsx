import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import HeaderActions from "@/components/legal/HeaderActions";
import LegalNav from "@/components/legal/LegalNav";
import RichText from "@/components/legal/RichText";
import { LEGAL } from "@/lib/legal/site";
import { THEME_SCRIPT } from "@/lib/legal/theme";

export const metadata: Metadata = {
  title: { template: "%s · FlashMiam", default: "Informations légales · FlashMiam" },
  description: "Mentions légales, conditions d'utilisation, conditions de vente et politique de confidentialité de FlashMiam.",
};

/** Retour à la carte (site principal, un niveau au-dessus de l'application) : « /app/../ » → « / ». */
const APP_HOME = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/../`;

/** Pages juridiques : en-tête avec retour à l'application, documents en barre latérale (ordinateur) ou en onglets (téléphone). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <div className="legal-root min-h-full bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100 print:bg-white">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/95 print:static print:border-0">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <a
              href={APP_HOME}
              className="inline-flex items-center gap-2 rounded-full py-2 pr-4 pl-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white print:hidden"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              <span className="hidden sm:inline">Retour à FlashMiam</span>
              <span className="sm:hidden">Retour</span>
            </a>
            <div className="mx-auto flex items-center gap-2.5 sm:mx-0 sm:ml-2">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white">F</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                FlashMiam <span className="hidden font-normal text-slate-500 sm:inline dark:text-slate-400">· Informations légales</span>
              </span>
            </div>
            <div className="ml-auto print:hidden"><HeaderActions /></div>
          </div>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:hidden print:hidden">
            <LegalNav variant="tabs" />
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8 lg:py-12">
          <aside className="hidden lg:block print:hidden">
            <div className="sticky top-24 space-y-6">
              <LegalNav variant="side" />
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                  <Mail aria-hidden className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Une question ?
                </p>
                <p className="mt-1.5 leading-6 text-slate-500 dark:text-slate-400">
                  Écrivez-nous : <RichText text={`{{${LEGAL.email}|mailto:${LEGAL.email}}}`} />
                </p>
              </div>
            </div>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>

        <footer className="border-t border-slate-200/70 dark:border-slate-800/80 print:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-slate-400">
            <p>© {new Date().getFullYear()} FlashMiam — La Roche-sur-Yon</p>
            <p>Documents mis à jour le {LEGAL.updated}</p>
          </div>
        </footer>
      </div>
    </>
  );
}
