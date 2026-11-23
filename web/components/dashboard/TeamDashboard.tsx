"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, Command, Loader2, Moon, Pause, Play, RefreshCw, Search, Sun } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";
import { THEME_KEY } from "@/lib/legal/theme";
import { MAP_URL, dayLabel, type Data } from "./data";
import { alerts } from "./alerts";
import { SECTIONS, go, sectionHref, useRoute, type Section } from "./nav";
import { Q, fetchQuery, prefetch, refreshActive, useBusy, useOldestActive, useQuery } from "./store";
import { Centered, Notice, SectionError, SectionSkeleton } from "./ui";
import { Overview, Restaurants, Server, Users } from "./panels";
import { Bugs } from "./bugs";
import { RevenuePanel } from "./revenue";
import { ReviewPanel } from "./review";
import { RestaurantDetail, RestaurantList } from "./restaurants";
import { Palette } from "./palette";

/**
 * Tableau de bord de l'équipe FlashMiam : une seule page, plusieurs sections (barre latérale sur ordinateur, onglets
 * sur téléphone), adressées par l'ancre de l'adresse (#revenus, #bugs, #fiches/<restaurant>…).
 *  - instantané : changer de section ou de période ne recharge pas la page ; les chiffres déjà lus restent affichés
 *    pendant que la base est relue (barre fine en haut de l'écran) ; sections voisines lues à l'avance ;
 *  - en direct : relecture toutes les minutes tant que la page est visible (« En direct », pause possible) ;
 *  - clavier : ⌘K / Ctrl+K ou / (palette : sections, restaurants, actions), 1 à 8 (sections), R (actualiser), T (thème).
 * Tout est calculé par la base et réservé aux comptes de l'équipe.
 */

const PERIODS = [[7, "7 j"], [30, "30 j"], [90, "90 j"], [365, "1 an"]] as const;
const DAYS_KEY = "flashmiam:dash-days";
const LIVE_KEY = "flashmiam:dash-live";
const LIVE_EVERY = 60_000;

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* préférence non gardée */ } },
};
const noSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export default function TeamDashboard() {
  return useHydrated() ? <App /> : <Splash />;
}
const Splash = () => (
  <div className="dash min-h-full bg-slate-50 dark:bg-night"><Centered><Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-label="Chargement" /></Centered></div>
);

function App() {
  const [session, setSession] = useState<"checking" | "in" | "out">("checking");
  useEffect(() => {
    let alive = true;
    siteClient().auth.getSession().then(({ data }) => { if (alive) setSession(data.session ? "in" : "out"); }, () => { if (alive) setSession("out"); });
    return () => { alive = false; };
  }, []);
  if (session === "checking") return <Splash />;
  if (session === "out") return (
    <Plain><Notice title="Connectez-vous d'abord" text="Le tableau de bord s'ouvre avec le compte FlashMiam d'un membre de l'équipe." action={<a href={MAP_URL} className="btn-dash">Se connecter sur la carte</a>} /></Plain>
  );
  return <Dashboard />;
}

const Plain = ({ children }: { children: ReactNode }) => (
  <div className="dash min-h-full bg-slate-50 px-4 text-slate-900 dark:bg-night dark:text-zinc-50">{children}</div>
);

function Dashboard() {
  const route = useRoute();
  const [days, setDaysState] = useState<number>(() => {
    const v = Number(store.get(DAYS_KEY));
    return PERIODS.some(([p]) => p === v) ? v : 30;
  });
  const setDays = (v: number) => { setDaysState(v); store.set(DAYS_KEY, String(v)); };
  const [live, setLiveState] = useState(() => store.get(LIVE_KEY) !== "0");
  const setLive = (v: boolean) => { setLiveState(v); store.set(LIVE_KEY, v ? "1" : "0"); };
  const [palette, setPalette] = useState(false);
  const night = useNight();

  const dash = useQuery<Data>(Q.dashboard<Data>(days));
  // Fiches à vérifier : toujours suivies (pastille de la barre latérale), quelle que soit la section affichée
  const queue = useQuery<unknown[]>(Q.reviewQueue<unknown[]>(), 30_000);
  const d = dash.data;
  const section = SECTIONS.find((s) => s.id === route.section)!;

  // Sections voisines lues à l'avance (changement de section instantané)
  useEffect(() => {
    if (!d) return;
    const t = setTimeout(() => { prefetch(Q.revenue()); prefetch(Q.merchants()); }, 800);
    return () => clearTimeout(t);
  }, [d]);

  // En direct : relecture toutes les minutes tant que la page est visible, et au retour sur l'onglet
  useEffect(() => {
    if (!live) return;
    const tick = () => { if (document.visibilityState === "visible") void refreshActive(); };
    const timer = setInterval(tick, LIVE_EVERY);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [live]);

  // Haut de page à chaque changement de section
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route.section, route.id]);

  // Raccourcis clavier (jamais pendant la saisie d'un texte)
  const toggleTheme = useCallback(() => setNight(!night), [night]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "/") { e.preventDefault(); setPalette(true); }
      else if (/^[1-8]$/.test(e.key)) go(SECTIONS[Number(e.key) - 1].id);
      else if (e.key === "r" || e.key === "R") void refreshActive();
      else if (e.key === "t" || e.key === "T") toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  if (dash.error?.code === "42501") return (
    <Plain><Notice title="Accès réservé à l'équipe" text="Ce compte n'a pas accès au tableau de bord de FlashMiam." action={<a href={MAP_URL} className="btn-dash">Retour à la carte</a>} /></Plain>
  );

  const list = d ? alerts(d) : [];
  const badges: Partial<Record<Section, [number, "critical" | "neutral"]>> = d ? {
    overview: [list.filter((a) => a.tone === "critical").length, "critical"],
    review: [queue.data?.length ?? d.merchants_pending.filter((m) => m.status === "awaiting_review").length, "critical"],
    bugs: [d.error_list.filter((e) => e.open).length, "critical"],
    restaurants: [d.reported_reviews.length, "neutral"],
  } : {};

  let body: ReactNode;
  if (route.section === "review") body = <ReviewPanel />;
  else if (route.section === "revenue") body = <RevenuePanel />;
  else if (route.section === "directory") body = route.id ? <RestaurantDetail id={route.id} days={days} /> : <RestaurantList />;
  else if (!d) body = dash.error ? <SectionError retry={() => fetchQuery(Q.dashboard(days).key)} /> : <SectionSkeleton />;
  else if (route.section === "overview") body = <Overview d={d} alerts={list} />;
  else if (route.section === "users") body = <Users d={d} />;
  else if (route.section === "restaurants") body = <Restaurants d={d} />;
  else if (route.section === "bugs") body = <Bugs d={d} />;
  else body = <Server d={d} />;

  return (
    <div className="dash min-h-full bg-slate-50 text-slate-900 antialiased dark:bg-night dark:text-zinc-50 dark:[color-scheme:dark]">
      <TopProgress />

      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white/70 px-3 pt-[max(16px,env(safe-area-inset-top))] pb-4 backdrop-blur lg:flex dark:border-white/10 dark:bg-white/[0.02]">
        <a href={sectionHref("overview")} className="flex items-center gap-2 px-2 py-1">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ff5a1f] text-sm font-black text-white" aria-hidden>F</span>
          <span className="leading-tight"><b className="block text-sm">FlashMiam</b><span className="text-xs text-slate-500 dark:text-zinc-400">Console de l&apos;équipe</span></span>
        </a>
        <button type="button" onClick={() => setPalette(true)} className="mt-4 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/5">
          <Search className="h-4 w-4" aria-hidden /> Rechercher…
          <kbd className="ml-auto rounded bg-slate-100 px-1.5 font-sans text-[11px] dark:bg-white/10">⌘K</kbd>
        </button>
        <nav aria-label="Sections" className="mt-4 grid gap-0.5">
          {SECTIONS.map((s, i) => {
            const active = route.section === s.id;
            const b = badges[s.id];
            return (
              <a key={s.id} href={sectionHref(s.id)} aria-current={active ? "page" : undefined}
                className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-slate-900 aria-[current=page]:text-white dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white dark:aria-[current=page]:bg-white dark:aria-[current=page]:text-slate-900">
                <s.icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{s.label}</span>
                {b && b[0] > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${b[1] === "critical" ? "bg-[#d03b3b] text-white" : "bg-slate-200 text-slate-700 dark:bg-white/15 dark:text-zinc-200"}`}>{b[0]}</span>}
                <kbd className="hidden font-sans text-[10px] text-slate-400 group-hover:inline">{i + 1}</kbd>
              </a>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-1 text-sm">
          <button type="button" onClick={toggleTheme} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5">
            {night ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />} {night ? "Mode jour" : "Mode nuit"}
            <kbd className="ml-auto font-sans text-[10px] text-slate-400">T</kbd>
          </button>
          <a href={MAP_URL} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Retour à la carte
          </a>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Barre du haut : section, période, état « en direct », actualiser, palette */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-white/10 dark:bg-night/85">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{route.section === "directory" && route.id ? "Fiche du restaurant" : section.label}</h1>
              {d && section.usesPeriod && <p className="text-xs text-slate-600 dark:text-zinc-400">Du {dayLabel(d.since)} à aujourd&apos;hui</p>}
            </div>
            {(section.usesPeriod || route.id) && (
              <div role="radiogroup" aria-label="Période" className="flex rounded-full bg-slate-200/70 p-0.5 dark:bg-white/[0.06]">
                {PERIODS.map(([p, label]) => (
                  <button key={p} type="button" role="radio" aria-checked={days === p} onClick={() => setDays(p)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-slate-600 transition aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm sm:text-sm dark:text-zinc-400 dark:aria-checked:bg-white/15 dark:aria-checked:text-white">
                    {label}
                  </button>
                ))}
              </div>
            )}
            <LiveStatus live={live} setLive={setLive} />
            <button type="button" onClick={() => void refreshActive()} aria-label="Actualiser (R)" title="Actualiser (R)" className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 ${dash.loading ? "animate-spin" : ""}`} aria-hidden />
            </button>
            <button type="button" onClick={() => setPalette(true)} aria-label="Rechercher (⌘K)" title="Rechercher (⌘K)" className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 lg:hidden dark:text-zinc-400 dark:hover:bg-white/10">
              <Command className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {/* Onglets (téléphone, tablette) */}
          <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-3 lg:hidden">
            {SECTIONS.map((s) => {
              const b = badges[s.id];
              return (
                <a key={s.id} href={sectionHref(s.id)} aria-current={route.section === s.id ? "page" : undefined}
                  className="relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium whitespace-nowrap text-slate-600 aria-[current=page]:text-slate-900 dark:text-zinc-400 dark:aria-[current=page]:text-white">
                  {s.label}
                  {b && b[0] > 0 && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${b[1] === "critical" ? "bg-[#d03b3b] text-white" : "bg-slate-200 text-slate-700 dark:bg-white/15 dark:text-zinc-200"}`}>{b[0]}</span>}
                  {route.section === s.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-slate-900 dark:bg-white" />}
                </a>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[max(24px,env(safe-area-inset-bottom))] sm:px-6">
          <div key={`${route.section}/${route.id ?? ""}`} className="dash-enter">{body}</div>
          <p className="mt-8 text-center text-xs leading-relaxed text-slate-500 dark:text-zinc-500">
            Visites comptées avec l&apos;accord « statistiques » (identifiant d&apos;appareil tiré au hasard, 13 mois) · bugs sans identifiant (90 jours) ·
            raccourcis : <kbd>⌘K</kbd> recherche, <kbd>1</kbd>–<kbd>8</kbd> sections, <kbd>R</kbd> actualiser, <kbd>T</kbd> thème
          </p>
        </main>
      </div>

      <Palette open={palette} onClose={() => setPalette(false)} night={night} toggleTheme={toggleTheme} live={live} setLive={setLive} />
    </div>
  );
}

/** Barre fine en haut de l'écran pendant une lecture (les chiffres affichés restent en place). */
function TopProgress() {
  const busy = useBusy();
  return (
    <div aria-hidden className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300 ${busy ? "opacity-100" : "opacity-0"}`}>
      <span className="dash-progress block h-full w-1/4 bg-[var(--viz-1)]" />
    </div>
  );
}

/** « En direct · il y a 12 s » : un clic met en pause (ou reprend) l'actualisation automatique. */
function LiveStatus({ live, setLive }: { live: boolean; setLive: (v: boolean) => void }) {
  const oldest = useOldestActive();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  const s = oldest ? Math.max(0, Math.round((now - oldest) / 1000)) : null;
  const age = s === null ? "…" : s < 10 ? "à l'instant" : s < 60 ? `il y a ${s} s` : `il y a ${Math.floor(s / 60)} min`;
  return (
    <button type="button" onClick={() => setLive(!live)} aria-pressed={live}
      title={live ? "Actualisation automatique chaque minute (cliquer pour mettre en pause)" : "Actualisation automatique en pause (cliquer pour reprendre)"}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-white dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/5">
      {live ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ca30c] opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#0ca30c]" /></span>
        : <Pause className="h-3 w-3" aria-hidden />}
      <span className="hidden sm:inline">{live ? "En direct" : "En pause"} ·</span> {age}
      {!live && <Play className="h-3 w-3" aria-hidden />}
    </button>
  );
}

/* ---------- Thème jour / nuit (le même que la carte) ---------- */

const subscribeTheme = (l: () => void) => {
  const o = new MutationObserver(l);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
};
const useNight = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "night", () => false);
function setNight(on: boolean) {
  document.documentElement.setAttribute("data-theme", on ? "night" : "day");
  store.set(THEME_KEY, on ? "dark" : "light");
}
