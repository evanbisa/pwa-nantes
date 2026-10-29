import Link from "next/link";
import { ArrowRight, CalendarDays, Hash, Mail, PenLine } from "lucide-react";
import { LEGAL_DOCS } from "@/lib/legal";
import { LEGAL } from "@/lib/legal/site";
import type { LegalDoc } from "@/lib/legal/types";
import Blocks from "./Blocks";
import RichText from "./RichText";
import TableOfContents from "./TableOfContents";

/** Informations encore entre crochets dans le document (rappel affiché tant qu'il en reste). */
function placeholders(doc: LegalDoc) {
  const texts = JSON.stringify([doc.notice ?? "", doc.sections.map((sec) => sec.blocks)]);
  return new Set(texts.match(/\[[^[\]"\\\n]+\]/g) ?? []).size;
}

/** Un document juridique : en-tête, sommaire, articles en cartes, puis liens vers les autres documents. */
export default function LegalDocument({ doc }: { doc: LegalDoc }) {
  const toc = doc.sections.map(({ id, title }) => ({ id, title }));
  const missing = placeholders(doc);
  const others = LEGAL_DOCS.filter((d) => d.slug !== doc.slug);
  const Icon = doc.icon;

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_220px]">
      <article className="min-w-0 space-y-6">
        <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/15 to-violet-500/10 blur-3xl print:hidden" />
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 dark:bg-blue-500">
            <Icon aria-hidden className="h-6 w-6" />
          </span>
          <p className="relative mt-5 text-sm font-medium text-blue-700 dark:text-blue-300">Informations légales</p>
          <h1 className="relative mt-1 text-3xl font-semibold tracking-tight text-balance text-slate-900 sm:text-4xl dark:text-white">{doc.title}</h1>
          <p className="relative mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">{doc.summary}</p>
          <div className="relative mt-6 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <CalendarDays aria-hidden className="h-4 w-4" /> Mis à jour le {doc.updated}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Hash aria-hidden className="h-4 w-4" /> {doc.sections.length} articles
            </span>
            {missing > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200 print:hidden"
                title="Valeurs entre crochets à renseigner dans web/lib/legal/site.ts"
              >
                <PenLine aria-hidden className="h-4 w-4" /> {missing} information{missing > 1 ? "s" : ""} à compléter
              </span>
            )}
          </div>
          {doc.notice && (
            <p className="relative mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
              <RichText text={doc.notice} />
            </p>
          )}
        </header>

        <div className="xl:hidden print:hidden">
          <TableOfContents items={toc} variant="inline" />
        </div>

        {doc.sections.map((section, n) => {
          const SectionIcon = section.icon;
          return (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-titre`}
              className="scroll-mt-36 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8 lg:scroll-mt-24 dark:border-slate-800 dark:bg-slate-900 print:break-inside-avoid print:shadow-none"
            >
              <div className="mb-5 flex items-center gap-4">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 ring-inset dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20">
                  <SectionIcon aria-hidden className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">Article {n + 1}</p>
                  <h2 id={`${section.id}-titre`} className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    <a href={`#${section.id}`} className="hover:text-blue-700 dark:hover:text-blue-300">{section.title}</a>
                  </h2>
                </div>
              </div>
              <Blocks blocks={section.blocks} />
            </section>
          );
        })}

        <footer className="space-y-4 pt-4 print:hidden">
          <h2 className="text-sm font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">À lire aussi</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {others.map((d) => {
              const DocIcon = d.icon;
              return (
                <Link
                  key={d.slug}
                  href={`/legal/${d.slug}/`}
                  className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/50"
                >
                  <DocIcon aria-hidden className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="mt-3 font-medium text-slate-900 dark:text-white">{d.title}</span>
                  <span className="mt-1 flex-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{d.summary}</span>
                  <ArrowRight aria-hidden className="mt-3 h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                </Link>
              );
            })}
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Mail aria-hidden className="h-4 w-4" /> Une question ? <RichText text={`{{${LEGAL.email}|mailto:${LEGAL.email}}}`} />
          </p>
        </footer>
      </article>

      <aside className="hidden xl:block print:hidden">
        <div className="sticky top-24">
          <TableOfContents items={toc} variant="aside" />
        </div>
      </aside>
    </div>
  );
}
