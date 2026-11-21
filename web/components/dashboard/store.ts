"use client";

import { useEffect, useSyncExternalStore } from "react";
import { siteClient } from "@/lib/supabase/site-session";

/**
 * Données du tableau de bord : une petite mémoire partagée par toutes les sections (rien n'est gardé sur l'appareil).
 *  - chaque requête a une clé (« dash:30 », « revenue », « merchant:<id>:30 »…) ;
 *  - une section affichée lit la mémoire tout de suite, puis la base est relue en arrière-plan si c'est trop ancien :
 *    changer de section ou de période est instantané, et les chiffres ne disparaissent jamais pendant une relecture ;
 *  - refreshActive() relit ce qui est affiché (bouton « Actualiser », raccourci R, actualisation automatique).
 */

export type QueryError = { code: string; message: string };
type Result = { data: unknown; error: { code?: string; message?: string } | null };
type Entry = { data?: unknown; error?: QueryError; at?: number; inflight?: Promise<void> };

const cache = new Map<string, Entry>();
const runners = new Map<string, () => PromiseLike<Result>>();
const mounted = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;

export type Query<T> = { key: string; _type?: T };
function query<T>(key: string, run: () => PromiseLike<Result>): Query<T> {
  if (!runners.has(key)) runners.set(key, run);
  return { key };
}

/** Requêtes du tableau de bord (toutes réservées à l'équipe par la base). */
export const Q = {
  dashboard: <T>(days: number) => query<T>(`dash:${days}`, () => siteClient().rpc("team_dashboard", { p_days: days })),
  revenue: <T>() => query<T>("revenue", () => siteClient().rpc("team_revenue")),
  merchants: <T>() => query<T>("merchants", () => siteClient().rpc("team_merchants")),
  merchant: <T>(id: string, days: number) => query<T>(`merchant:${id}:${days}`, () => siteClient().rpc("team_merchant", { p_merchant_id: id, p_days: days })),
};

/** Lit (ou relit) une requête ; une seule lecture à la fois par clé. */
export function fetchQuery(key: string): Promise<void> {
  const run = runners.get(key);
  if (!run) return Promise.resolve();
  const e = cache.get(key) ?? {};
  cache.set(key, e);
  if (e.inflight) return e.inflight;
  e.inflight = (async () => {
    try {
      const { data, error } = await run();
      if (error) e.error = { code: error.code ?? "", message: error.message ?? "" };
      else { e.data = data; e.error = undefined; e.at = Date.now(); }
    } catch (err) {
      e.error = { code: "network", message: err instanceof Error ? err.message : String(err) };
    }
  })().finally(() => { e.inflight = undefined; emit(); });
  emit();
  return e.inflight;
}

/** Relit tout ce qui est affiché en ce moment. */
export const refreshActive = async () => { await Promise.all([...mounted].filter(([, n]) => n > 0).map(([k]) => fetchQuery(k))); };
/** Relit tout ce qui est en mémoire (après une modification : avis, bug…), affiché ou non. */
export const refreshAll = async () => { await Promise.all([...cache.keys()].map((k) => fetchQuery(k))); };
/** Lecture anticipée (section voisine) : ne fait rien si c'est déjà en mémoire. */
export const prefetch = (q: Query<unknown>) => { if (!cache.get(q.key)?.at) void fetchQuery(q.key); };

/** Une lecture est-elle en cours ? (barre de progression en haut de l'écran) */
export function useBusy() {
  return useSyncExternalStore(subscribe, () => [...cache.values()].some((e) => e.inflight), () => false);
}
/** Date de la donnée affichée la plus ancienne (« mis à jour il y a… »). */
export function useOldestActive() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const ats = [...mounted].filter(([, n]) => n > 0).map(([k]) => cache.get(k)?.at).filter((x): x is number => !!x);
  return ats.length ? Math.min(...ats) : null;
}

export function useQuery<T>(q: Query<T> | null, maxAge = 60_000) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const key = q?.key ?? null;
  useEffect(() => {
    if (!key) return;
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    const e = cache.get(key);
    if (!e?.inflight && (!e?.at || Date.now() - e.at > maxAge)) void fetchQuery(key);
    return () => { mounted.set(key, (mounted.get(key) ?? 1) - 1); };
  }, [key, maxAge]);
  const e = key ? cache.get(key) : undefined;
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: !!e?.inflight,
    at: e?.at ?? null,
    refresh: () => (key ? fetchQuery(key) : Promise.resolve()),
  };
}
