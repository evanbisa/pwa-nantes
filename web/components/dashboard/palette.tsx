"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CornerDownLeft, Moon, Pause, Play, RefreshCw, Search, Store, Sun, type LucideIcon } from "lucide-react";
import { MAP_URL } from "./data";
import { SECTIONS, go } from "./nav";
import { Q, prefetch, refreshActive, useQuery } from "./store";

/**
 * Palette de commandes (⌘K, Ctrl+K ou /) : aller à une section, ouvrir la fiche d'un restaurant (nom, responsable,
 * e-mail, SIRET), actualiser, changer de thème, mettre en pause le direct. Flèches, Entrée, Échap.
 */

type Item = { id: string; group: string; label: string; hint?: string; icon: LucideIcon; run: () => void; keys?: string };
type Merchant = { id: string | null; name: string | null; owner: string | null; email: string | null; siret: string | null; status: string; is_test: boolean };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function Palette({ open, onClose, night, toggleTheme, live, setLive }: {
  open: boolean; onClose: () => void; night: boolean; toggleTheme: () => void; live: boolean; setLive: (v: boolean) => void;
}) {
  if (!open) return null;
  return <PaletteDialog {...{ onClose, night, toggleTheme, live, setLive }} />;
}

function PaletteDialog({ onClose, night, toggleTheme, live, setLive }: {
  onClose: () => void; night: boolean; toggleTheme: () => void; live: boolean; setLive: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { data: merchants } = useQuery<Merchant[]>(Q.merchants<Merchant[]>(), 5 * 60_000);

  useEffect(() => {
    prefetch(Q.merchants());
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const items = useMemo<Item[]>(() => {
    const done = (fn: () => void) => () => { fn(); onClose(); };
    const base: Item[] = [
      ...SECTIONS.map((s, i) => ({ id: `s:${s.id}`, group: "Sections", label: s.label, icon: s.icon, keys: String(i + 1), run: done(() => go(s.id)) })),
      { id: "a:refresh", group: "Actions", label: "Actualiser les chiffres", icon: RefreshCw, keys: "R", run: done(() => void refreshActive()) },
      { id: "a:theme", group: "Actions", label: night ? "Passer en mode jour" : "Passer en mode nuit", icon: night ? Sun : Moon, keys: "T", run: done(toggleTheme) },
      { id: "a:live", group: "Actions", label: live ? "Mettre le direct en pause" : "Reprendre le direct", icon: live ? Pause : Play, run: done(() => setLive(!live)) },
      { id: "a:map", group: "Actions", label: "Retour à la carte", icon: ArrowLeft, run: done(() => window.location.assign(MAP_URL)) },
    ];
    const resto: Item[] = (merchants ?? []).filter((m) => m.id).map((m) => ({
      id: `m:${m.id}`, group: "Restaurants", label: m.name ?? "(sans nom)", icon: Store,
      hint: [m.owner, m.email, m.is_test ? "test" : null].filter(Boolean).join(" · "),
      run: done(() => go("directory", m.id)),
    }));
    const needle = norm(q);
    if (!needle) return [...base, ...resto.slice(0, 5)];
    const digits = needle.replace(/ /g, "");
    return [...base, ...resto].filter((it) => {
      const m = (merchants ?? []).find((x) => `m:${x.id}` === it.id);
      return norm(it.label).includes(needle) || (it.hint && norm(it.hint).includes(needle))
        || (m?.siret && /^\d+$/.test(digits) && m.siret.includes(digits));
    }).slice(0, 30);
  }, [q, merchants, night, live, toggleTheme, setLive, onClose]);

  const current = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % Math.max(1, items.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((current - 1 + items.length) % Math.max(1, items.length)); }
    else if (e.key === "Enter") { e.preventDefault(); items[current]?.run(); }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm dark:bg-black/60" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Rechercher" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}
        className="dash-pop w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-[#1a1a1d] dark:ring-white/10">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="Section, restaurant, responsable, SIRET, action…"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[current] ? `pal-${current}` : undefined}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] text-slate-500 dark:bg-white/10 dark:text-zinc-400">Échap</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Aucun résultat{merchants ? "" : " (restaurants en cours de chargement…)"}</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{header}</p>}
                <div
                  id={`pal-${i}`} data-i={i} role="option" aria-selected={i === current}
                  onMouseMove={() => setActive(i)} onClick={it.run}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-slate-100 dark:aria-selected:bg-white/10"
                >
                  <it.icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{it.label}{it.hint && <span className="ml-2 text-xs text-slate-500 dark:text-zinc-400">{it.hint}</span>}</span>
                  {it.keys && <kbd className="font-sans text-[11px] text-slate-400">{it.keys}</kbd>}
                  {i === current && <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-zinc-400">
          ↑ ↓ pour choisir · Entrée pour ouvrir · ⌘K ou / pour rouvrir · 1–7 sections · R actualiser · T thème
        </p>
      </div>
    </div>
  );
}
