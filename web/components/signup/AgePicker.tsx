"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { AGE_MAX, AGE_MIN } from "@/lib/signup/validation";

/**
 * Choix de l'âge : grand compteur, boutons − / + et curseur, comme sur la carte (index.html).
 * Curseur : on glisse le doigt n'importe où sur la barre, sans saut au premier contact. La vitesse du geste règle la
 * précision : lentement, une année tous les 18 px (facile de viser son âge exact) ; plus vite, tous les 9 puis 4 px.
 * Simple toucher : une année vers le côté touché. − et + : un appui = une année, appui maintenu = défilement accéléré.
 */
const clamp = (v: number) => Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(v)));

type Drag = { id: number; x: number; t: number; x0: number; t0: number; acc: number; moved: boolean };

export default function AgePicker({ value, onChange, labelledBy, onEnter }: {
  value: number; onChange: (age: number) => void; labelledBy: string; onEnter: () => void;
}) {
  const current = useRef(value);
  const drag = useRef<Drag | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { current.current = value; }, [value]);
  const set = (v: number) => { const next = clamp(v); if (next !== current.current) { current.current = next; onChange(next); } };
  const pct = ((value - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;

  function down(ev: PointerEvent<HTMLDivElement>) {
    if (ev.button !== 0) return;
    drag.current = { id: ev.pointerId, x: ev.clientX, t: ev.timeStamp, x0: ev.clientX, t0: ev.timeStamp, acc: 0, moved: false };
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.currentTarget.focus({ preventScroll: true });
  }
  function move(ev: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || ev.pointerId !== d.id) return;
    const dx = ev.clientX - d.x, dt = Math.max(1, ev.timeStamp - d.t);
    if (!d.moved && Math.abs(ev.clientX - d.x0) < 4) return;
    d.moved = true;
    const speed = Math.abs(dx) / dt;                         // pixels par milliseconde
    d.acc += dx / (speed < 0.35 ? 18 : speed < 1 ? 9 : 4);
    d.x = ev.clientX; d.t = ev.timeStamp;
    const years = d.acc > 0 ? Math.floor(d.acc + 1e-6) : Math.ceil(d.acc - 1e-6);   // (54 / 18 = 2,9999… sans la marge)
    if (years) { d.acc -= years; set(current.current + years); }
  }
  function up(ev: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || ev.pointerId !== d.id) return;
    if (!d.moved && ev.type === "pointerup" && ev.timeStamp - d.t0 < 400 && bar.current) {
      const r = bar.current.getBoundingClientRect();
      const thumbX = r.left + r.width * ((current.current - AGE_MIN) / (AGE_MAX - AGE_MIN));
      if (Math.abs(ev.clientX - thumbX) > 16) set(current.current + (ev.clientX > thumbX ? 1 : -1));
    }
    drag.current = null;
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
        className="group relative mt-8 h-11 cursor-grab touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 active:cursor-grabbing dark:ring-offset-night dark:focus-visible:ring-brand-night"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <span className="su-gradient block h-full bg-brand" style={{ width: `${pct}%` }} />
        </span>
        <span
          aria-hidden
          className="su-thumb absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-brand bg-white shadow-md transition-transform group-active:scale-110 dark:border-brand-night dark:bg-night dark:shadow-[0_0_18px_rgb(167_139_250/0.45)]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <p aria-hidden className="mt-2 text-center text-xs text-slate-500 dark:text-zinc-400">Glissez doucement pour ajuster année par année</p>
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
