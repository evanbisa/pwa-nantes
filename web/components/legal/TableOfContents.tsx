"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ListTree } from "lucide-react";

export interface TocItem { id: string; title: string }

/** Article en cours de lecture : le plus haut encore visible sous l'en-tête. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-88px 0px -55% 0px" },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/**
 * Sommaire cliquable du document (défilement fluide : voir la règle « scroll-behavior » de globals.css).
 * « aside » : colonne fixe sur grand écran, avec l'article en cours mis en avant ; « inline » : bloc repliable sur téléphone.
 */
export default function TableOfContents({ items, variant }: { items: TocItem[]; variant: "aside" | "inline" }) {
  const active = useActiveSection(items.map((i) => i.id));

  const links = (
    <ol className="space-y-0.5">
      {items.map((item, n) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            aria-current={variant === "aside" && active === item.id ? "location" : undefined}
            className="flex gap-2.5 rounded-lg border-l-2 border-transparent py-1.5 pr-2 pl-3 text-sm leading-5 text-slate-500 transition-colors hover:text-slate-900 aria-[current=location]:border-blue-600 aria-[current=location]:font-medium aria-[current=location]:text-blue-700 dark:text-slate-400 dark:hover:text-white dark:aria-[current=location]:border-blue-400 dark:aria-[current=location]:text-blue-300"
          >
            <span className="w-5 flex-none text-xs leading-5 tabular-nums text-slate-400 dark:text-slate-500">{n + 1}.</span>
            <span>{item.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  if (variant === "inline") {
    return (
      <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-medium text-slate-900 [&::-webkit-details-marker]:hidden dark:text-slate-50">
          <ListTree aria-hidden className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Sommaire
          <span className="text-sm font-normal text-slate-400">{items.length} articles</span>
          <ChevronRight aria-hidden className="ml-auto h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-slate-200/80 px-3 py-3 dark:border-slate-800">{links}</div>
      </details>
    );
  }

  return (
    <nav aria-label="Sommaire">
      <p className="mb-3 flex items-center gap-2 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
        <ListTree aria-hidden className="h-4 w-4" /> Sur cette page
      </p>
      {links}
    </nav>
  );
}
