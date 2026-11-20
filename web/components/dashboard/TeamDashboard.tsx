"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { siteClient } from "@/lib/supabase/site-session";
import { MAP_URL, RESTAURANTS_URL, dayLabel, type Data } from "./data";
import { alerts, type Tab } from "./alerts";
import { Notice, Shell, Centered } from "./ui";
import { Overview, Restaurants, Server, Users } from "./panels";
import { Bugs } from "./bugs";

/**
 * Tableau de bord de l'équipe FlashMiam, en 5 onglets : vue d'ensemble (à surveiller, chiffres clés, activité),
 * utilisateurs, restaurants, bugs (vus sur les appareils, à marquer corrigés), serveur (quotas, tâches, paiement).
 * Chiffres calculés par la base (team_dashboard), réservés aux comptes de l'équipe : la page n'affiche rien d'autre
 * que ce que la base accepte de donner. Actualisation toutes les 5 minutes tant que la page est affichée.
 */

type State = { status: "loading" } | { status: "signed-out" } | { status: "forbidden" } | { status: "error"; message: string } | { status: "ready"; data: Data };

const PERIODS = [7, 30, 90] as const;
const MAP = MAP_URL;
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "users", label: "Utilisateurs" },
  { id: "restaurants", label: "Restaurants" },
  { id: "bugs", label: "Bugs" },
  { id: "server", label: "Serveur" },
];
const AUTO_REFRESH = 5 * 60 * 1000;

const noSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);
const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : "overview";
};

export default function TeamDashboard() {
  return useHydrated() ? <Dashboard /> : <Shell><Centered><Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-label="Chargement" /></Centered></Shell>;
}

function Dashboard() {
  const [days, setDays] = useState<number>(30);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "overview" ? location.pathname : `#${t}`);
    window.scrollTo({ top: 0 });
  };

  const load = useCallback(async (period: number) => {
    const sb = siteClient();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) return setState({ status: "signed-out" });
    setRefreshing(true);
    const { data, error } = await sb.rpc("team_dashboard", { p_days: period });
    setRefreshing(false);
    if (error) {
      if (error.code === "42501") return setState({ status: "forbidden" });
      return setState((s) => (s.status === "ready" ? s : { status: "error", message: "Chiffres indisponibles pour le moment. Vérifiez votre connexion, puis réessayez." }));
    }
    setState({ status: "ready", data: data as unknown as Data });
  }, []);

  // Onglet suivi dans l'adresse (#bugs…) : retour arrière et liens partagés
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Chargement au changement de période, puis toutes les 5 minutes tant que la page est visible
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) void load(days); });
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(days); }, AUTO_REFRESH);
    const onVisible = () => { if (document.visibilityState === "visible") void load(days); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [days, load]);

  if (state.status === "loading") return <Shell><Centered><Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-label="Chargement" /></Centered></Shell>;
  if (state.status === "signed-out") return (
    <Shell><Notice title="Connectez-vous d'abord" text="Le tableau de bord s'ouvre avec le compte FlashMiam d'un membre de l'équipe." action={<a href={MAP} className="btn-dash">Se connecter sur la carte</a>} /></Shell>
  );
  if (state.status === "forbidden") return (
    <Shell><Notice title="Accès réservé à l'équipe" text="Ce compte n'a pas accès au tableau de bord de FlashMiam." action={<a href={MAP} className="btn-dash">Retour à la carte</a>} /></Shell>
  );
  if (state.status === "error") return (
    <Shell><Notice title="Oups" text={state.message} action={<button type="button" className="btn-dash" onClick={() => load(days)}>Réessayer</button>} /></Shell>
  );

  const d = state.data;
  const list = alerts(d);
  const openBugs = d.error_list.filter((e) => e.open).length;
  return (
    <Shell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href={MAP} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Carte
          </a>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
            Du {dayLabel(d.since)} à aujourd&apos;hui · mis à jour à {new Date(d.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {/* Filtres : une seule rangée, au-dessus de tous les graphiques */}
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Période" className="flex rounded-full bg-slate-200/70 p-1 dark:bg-white/[0.06]">
            {PERIODS.map((p) => (
              <button
                key={p} type="button" role="radio" aria-checked={days === p} onClick={() => setDays(p)}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-600 transition aria-checked:bg-white aria-checked:text-slate-900 aria-checked:shadow-sm dark:text-zinc-400 dark:aria-checked:bg-white/15 dark:aria-checked:text-white"
              >
                {p} j
              </button>
            ))}
          </div>
          <button type="button" onClick={() => load(days)} aria-label="Actualiser" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      </header>

      <nav role="tablist" aria-label="Sections" className="sticky top-0 z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur dark:border-white/10 dark:bg-night/95 sm:-mx-6 sm:px-6">
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className="relative shrink-0 px-3 py-3 text-sm font-medium whitespace-nowrap text-slate-600 hover:text-slate-900 aria-selected:text-slate-900 dark:text-zinc-400 dark:hover:text-white dark:aria-selected:text-white"
          >
            {t.label}
            {t.id === "bugs" && openBugs > 0 && <span className="ml-1.5 rounded-full bg-[#d03b3b] px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">{openBugs}</span>}
            {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-slate-900 dark:bg-white" />}
          </button>
        ))}
        <a href={RESTAURANTS_URL} className="ml-auto shrink-0 px-3 py-3 text-sm font-medium whitespace-nowrap text-[var(--viz-1)] hover:underline">Fiches des restaurants →</a>
      </nav>

      <div role="tabpanel" className="mt-5">
        {tab === "overview" && <Overview d={d} alerts={list} go={setTab} />}
        {tab === "users" && <Users d={d} />}
        {tab === "restaurants" && <Restaurants d={d} reload={() => load(days)} />}
        {tab === "bugs" && <Bugs d={d} reload={() => load(days)} />}
        {tab === "server" && <Server d={d} />}
      </div>

      <p className="mt-6 pb-4 text-center text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
        Visites comptées seulement avec l&apos;accord « statistiques » (identifiant d&apos;appareil tiré au hasard, gardé 13 mois). Bugs : sans identifiant de personne ni d&apos;appareil, gardés 90 jours. Les restaurateurs ne voient que leurs propres totaux.
      </p>
    </Shell>
  );
}
