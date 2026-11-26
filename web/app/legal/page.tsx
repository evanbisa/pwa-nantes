import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { LEGAL_DOCS } from "@/lib/legal";

/** Accueil des informations légales : les quatre documents en cartes. */
export default function LegalHome() {
  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/25 dark:bg-orange-500">
          <Scale aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="relative mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">Informations légales</h1>
        <p className="relative mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
          Tout ce qu&apos;il faut savoir sur FlashMiam : qui nous sommes, les règles d&apos;utilisation, l&apos;abonnement des
          restaurateurs et la protection de vos données. Écrit pour être lu, pas seulement pour être signé.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {LEGAL_DOCS.map((doc) => {
          const Icon = doc.icon;
          return (
            <li key={doc.slug}>
              <Link
                href={`/legal/${doc.slug}/`}
                className="group flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-orange-500/50"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 ring-inset dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{doc.title}</span>
                <span className="mt-1.5 flex-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{doc.summary}</span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 dark:text-orange-300">
                  Lire · {doc.sections.length} articles
                  <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
