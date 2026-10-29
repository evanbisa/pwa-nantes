import Link from "next/link";
import type { ReactNode } from "react";
import type { Rich } from "@/lib/legal/types";

// **gras** · {{libellé|lien}} · [À_COMPLÉTER]
const TOKEN = /(\*\*.+?\*\*|\{\{[^}|]+\|[^}]+\}\}|\[[^\]\n]+\])/g;

/** Lien interne vers un document juridique : « /legal/cgu#avis » → « /legal/cgu/#avis » (site exporté avec barre finale). */
function internalHref(href: string) {
  const [path, hash] = href.split("#");
  return (path.endsWith("/") ? path : path + "/") + (hash ? "#" + hash : "");
}

const linkClass =
  "font-medium text-blue-700 underline decoration-blue-700/30 underline-offset-2 transition-colors hover:decoration-blue-700 dark:text-blue-300 dark:decoration-blue-300/30 dark:hover:decoration-blue-300";

/** Texte des documents juridiques, avec mise en forme légère et informations à compléter surlignées. */
export default function RichText({ text }: { text: Rich }): ReactNode {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-slate-50">
          <RichText text={part.slice(2, -2)} />
        </strong>
      );
    }
    if (part.startsWith("{{") && part.endsWith("}}")) {
      const [label, href] = part.slice(2, -2).split("|");
      if (href.startsWith("/")) return <Link key={i} href={internalHref(href)} className={linkClass}>{label}</Link>;
      const external = href.startsWith("http");
      return (
        <a key={i} href={href} className={linkClass} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {label}
        </a>
      );
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      return (
        <mark
          key={i}
          title="Information à compléter (web/lib/legal/site.ts)"
          className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[0.8em] font-medium text-amber-900 ring-1 ring-amber-300 ring-inset dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/30"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}
