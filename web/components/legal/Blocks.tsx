import { Info, TriangleAlert } from "lucide-react";
import type { Block } from "@/lib/legal/types";
import RichText from "./RichText";

/** Contenu d'un article : paragraphes, listes, encadrés, fiches d'identité, tableaux en cartes. */
export default function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4 text-[15px] leading-7 text-slate-600 dark:text-slate-300">
      {blocks.map((b, i) => {
        if (typeof b === "string") return <p key={i}><RichText text={b} /></p>;

        if ("list" in b) {
          const List = b.ordered ? "ol" : "ul";
          return (
            <List key={i} className={`space-y-2 pl-1 ${b.ordered ? "list-decimal pl-6" : ""}`}>
              {b.list.map((item, j) => (
                <li key={j} className={b.ordered ? "pl-1" : "flex gap-3"}>
                  {!b.ordered && <span aria-hidden className="mt-[11px] h-1.5 w-1.5 flex-none rounded-full bg-blue-500/70 dark:bg-blue-400/70" />}
                  <span><RichText text={item} /></span>
                </li>
              ))}
            </List>
          );
        }

        if ("callout" in b) {
          const warning = b.tone === "warning";
          const Icon = warning ? TriangleAlert : Info;
          return (
            <div
              key={i}
              className={`flex gap-3 rounded-xl border p-4 ${warning
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100"}`}
            >
              <Icon aria-hidden className="mt-1 h-5 w-5 flex-none" />
              <p><RichText text={b.callout} /></p>
            </div>
          );
        }

        if ("facts" in b) {
          return (
            <dl key={i} className="divide-y divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
              {b.facts.map(([term, value], j) => (
                <div key={j} className="grid gap-1 bg-slate-50/60 px-4 py-3 sm:grid-cols-[200px_1fr] sm:gap-4 dark:bg-slate-900/40">
                  <dt className="text-sm font-medium text-slate-500 dark:text-slate-400"><RichText text={term} /></dt>
                  <dd className="text-slate-800 dark:text-slate-100"><RichText text={value} /></dd>
                </div>
              ))}
            </dl>
          );
        }

        return (
          <div key={i} className="grid gap-3 sm:grid-cols-2">
            {b.rows.map((row, j) => (
              <div key={j} className="flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="font-semibold leading-6 text-slate-900 dark:text-slate-50"><RichText text={row.title} /></p>
                <p className="mt-1.5 flex-1 text-sm leading-6"><RichText text={row.detail} /></p>
                {row.basis && (
                  <p className="mt-3 inline-flex self-start rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 ring-inset dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                    <RichText text={row.basis} />
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
