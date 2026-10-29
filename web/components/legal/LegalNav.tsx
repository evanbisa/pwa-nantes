"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Building2, FileText, Receipt, ShieldCheck } from "lucide-react";

/** Les quatre documents (icônes répétées ici : les composants d'icône ne passent pas du serveur au client). */
const DOCS = [
  { slug: "mentions-legales", label: "Mentions légales", icon: Building2 },
  { slug: "cgu", label: "CGU", hint: "Conditions d'utilisation", icon: FileText },
  { slug: "cgv", label: "CGV", hint: "Conditions de vente", icon: Receipt },
  { slug: "confidentialite", label: "Confidentialité", icon: ShieldCheck },
] as const;

/**
 * Navigation entre les documents juridiques : barre latérale sur ordinateur (variant « side »),
 * onglets défilants sur téléphone (variant « tabs »).
 */
export default function LegalNav({ variant }: { variant: "side" | "tabs" }) {
  const pathname = usePathname() ?? "";
  const active = (slug: string) => pathname.replace(/\/$/, "").endsWith("/legal/" + slug);

  // Onglets (téléphone) : le document affiché est ramené dans la partie visible de la barre
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  if (variant === "tabs") {
    return (
      <nav ref={tabsRef} aria-label="Documents juridiques" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max gap-2 py-3">
          {DOCS.map(({ slug, label, icon: Icon }) => (
            <li key={slug}>
              <Link
                href={`/legal/${slug}/`}
                aria-current={active(slug) ? "page" : undefined}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium whitespace-nowrap text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 aria-[current=page]:border-blue-600 aria-[current=page]:bg-blue-600 aria-[current=page]:text-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white dark:aria-[current=page]:border-blue-600 dark:aria-[current=page]:bg-blue-600"
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Documents juridiques">
      <p className="mb-3 px-3 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">Documents</p>
      <ul className="space-y-1">
        {DOCS.map(({ slug, label, icon: Icon, ...rest }) => (
          <li key={slug}>
            <Link
              href={`/legal/${slug}/`}
              aria-current={active(slug) ? "page" : undefined}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-white aria-[current=page]:text-blue-700 aria-[current=page]:shadow-sm aria-[current=page]:ring-1 aria-[current=page]:ring-slate-200 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white dark:aria-[current=page]:bg-slate-900 dark:aria-[current=page]:text-blue-300 dark:aria-[current=page]:ring-slate-800"
            >
              <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:text-slate-700 group-aria-[current=page]:bg-blue-50 group-aria-[current=page]:text-blue-600 dark:bg-slate-800 dark:text-slate-400 dark:group-aria-[current=page]:bg-blue-500/15 dark:group-aria-[current=page]:text-blue-300">
                <Icon aria-hidden className="h-4 w-4" />
              </span>
              <span className="leading-tight">
                {label}
                {"hint" in rest && <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{rest.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
