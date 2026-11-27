"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { AGE_MAX, AGE_MIN } from "@/lib/signup/validation";

/**
 * Choix de l'âge : grand compteur, boutons − / + et curseur.
 * Curseur : le pouce suit le doigt (ou se place là où l'on touche). Échelle non linéaire, pensée pour un public jeune :
 * les deux premiers tiers de la barre couvrent 13 à 40 ans (une année tous les 8-9 px environ sur téléphone), le dernier
 * tiers 40 à 99 ans. − et + : un appui = une année, appui maintenu = défilement accéléré.
 */
const clamp = (v: number) => Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(v)));
const PIVOT_AGE = 40, PIVOT_POS = 2 / 3;
/** Position sur la barre (0 à 1) → âge. */
const ageAt = (p: number) => {
  const x = Math.max(0, Math.min(1, p));
  return clamp(x <= PIVOT_POS
    ? AGE_MIN + (x / PIVOT_POS) * (PIVOT_AGE - AGE_MIN)
    : PIVOT_AGE + ((x - PIVOT_POS) / (1 - PIVOT_POS)) * (AGE_MAX - PIVOT_AGE));
};
/** Âge → position sur la barre (0 à 1). */
const posOf = (age: number) => age <= PIVOT_AGE
  ? ((age - AGE_MIN) / (PIVOT_AGE - AGE_MIN)) * PIVOT_POS
  : PIVOT_POS + ((age - PIVOT_AGE) / (AGE_MAX - PIVOT_AGE)) * (1 - PIVOT_POS);

export default function AgePicker({ value, onChange, labelledBy, onEnter }: {
  value: number; onChange: (age: number) => void; labelledBy: string; onEnter: () => void;
}) {
  const current = useRef(value);
  const dragging = useRef<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { current.current = value; }, [value]);
  const set = (v: number) => { const next = clamp(v); if (next !== current.current) { current.current = next; onChange(next); } };
  const pct = posOf(value) * 100;
  /** Âge sous le doigt (la barre a une marge de la moitié du pouce de chaque côté). */
  const follow = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (r && r.width > 0) set(ageAt((clientX - r.left) / r.width));
  };

  function down(ev: PointerEvent<HTMLDivElement>) {
    if (ev.button !== 0) return;
    dragging.current = ev.pointerId;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.currentTarget.focus({ preventScroll: true });
    follow(ev.clientX);
  }
  function move(ev: PointerEvent<HTMLDivElement>) {
    if (dragging.current === ev.pointerId) follow(ev.clientX);
  }
  function up(ev: PointerEvent<HTMLDivElement>) {
    if (dragging.current === ev.pointerId) dragging.current = null;
  }
  function key(ev: KeyboardEvent<HTMLDivElement>) {
    const step = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 } as Record<string, number>)[ev.key];
    if (step) { ev.preventDefault(); set(current.current + step); return; }
    if (ev.key === "Home") { ev.preventDefault(); set(AGE_MIN); }
    if (ev.key === "End") { ev.preventDefault(); set(AGE_MAX); }
    if (ev.key === "Enter") { ev.preventDefault(); onEnter(); }
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-center gap-6">
        <HoldButton label="Un an de moins" disabled={value <= AGE_MIN} onStep={() => set(current.current - 1)}><Minus className="h-5 w-5" /></HoldButton>
        <output htmlFor="su-age" aria-live="polite" className="min-w-28 text-center text-6xl font-bold tabular-nums tracking-tight">
          {value}<span className="ml-1 text-lg font-medium text-slate-500 dark:text-zinc-400">ans</span>
        </output>
        <HoldButton label="Un an de plus" disabled={value >= AGE_MAX} onStep={() => set(current.current + 1)}><Plus className="h-5 w-5" /></HoldButton>
      </div>
      <div
        id="su-age" ref={bar} role="slider" tabIndex={0} aria-labelledby={labelledBy}
        aria-valuemin={AGE_MIN} aria-valuemax={AGE_MAX} aria-valuenow={value} aria-valuetext={`${value} ans`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        className="group relative mx-4 mt-8 h-12 cursor-grab touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 active:cursor-grabbing dark:ring-offset-night dark:focus-visible:ring-brand-night"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <span className="su-gradient block h-full bg-brand" style={{ width: `${pct}%` }} />
        </span>
        <span
          aria-hidden
          className="su-thumb absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-slate-900 bg-white shadow-md transition-transform group-active:scale-110 dark:border-white dark:bg-night dark:shadow-[0_0_18px_rgb(255_122_69/0.45)]"
          style={{ left: `${pct}%` }}
        />
      </div>
    </>
  );
}

/** − et + : un appui = une année ; appui maintenu = défilement, de plus en plus rapide. */
function HoldButton({ label, disabled, onStep, children }: { label: string; disabled: boolean; onStep: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const step = useRef(onStep);
  useEffect(() => { step.current = onStep; }, [onStep]);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  useEffect(() => { if (disabled) stop(); }, [disabled]);   // borne atteinte : un bouton désactivé ne reçoit plus le relâchement
  function start(ev: PointerEvent<HTMLButtonElement>) {
    if (ev.button !== 0) return;
    held.current = false;
    const started = Date.now();
    const tick = () => {
      held.current = true;
      step.current();
      const elapsed = Date.now() - started;
      timer.current = setTimeout(tick, elapsed > 1800 ? 60 : elapsed > 900 ? 110 : 180);
    };
    timer.current = setTimeout(tick, 420);
  }
  return (
    <button
      type="button" aria-label={label} disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onClick={() => { if (held.current) { held.current = false; return; } step.current(); }}
      className="grid h-14 w-14 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-30 dark:bg-white/[0.05] dark:text-zinc-200 dark:ring-white/10 dark:backdrop-blur-xl dark:hover:bg-white/10 dark:focus-visible:ring-brand-night"
    >
      {children}
    </button>
  );
}
