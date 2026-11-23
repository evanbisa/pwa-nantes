"use client";

import { useSyncExternalStore } from "react";
import { Bug, Euro, LayoutDashboard, Notebook, Server, ShieldCheck, Store, Users, type LucideIcon } from "lucide-react";

/**
 * Sections du tableau de bord, adressées par l'ancre de l'adresse : #verifier, #revenus, #bugs, #fiches/<restaurant>…
 * Changer de section ne recharge rien ; le bouton « précédent » du navigateur et les liens partagés fonctionnent.
 */
export type Section = "overview" | "review" | "revenue" | "users" | "restaurants" | "directory" | "bugs" | "server";
export type Route = { section: Section; id: string | null };

export const SECTIONS: { id: Section; hash: string; label: string; icon: LucideIcon; usesPeriod: boolean }[] = [
  { id: "overview", hash: "", label: "Vue d'ensemble", icon: LayoutDashboard, usesPeriod: true },
  { id: "review", hash: "verifier", label: "À vérifier", icon: ShieldCheck, usesPeriod: false },
  { id: "revenue", hash: "revenus", label: "Revenus", icon: Euro, usesPeriod: false },
  { id: "users", hash: "users", label: "Utilisateurs", icon: Users, usesPeriod: true },
  { id: "restaurants", hash: "restaurants", label: "Restaurants", icon: Store, usesPeriod: true },
  { id: "directory", hash: "fiches", label: "Fiches restaurants", icon: Notebook, usesPeriod: false },
  { id: "bugs", hash: "bugs", label: "Bugs", icon: Bug, usesPeriod: true },
  { id: "server", hash: "server", label: "Serveur", icon: Server, usesPeriod: false },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseHash(hash: string): Route {
  const [head, id] = decodeURIComponent(hash.replace(/^#/, "")).split("/");
  const s = SECTIONS.find((x) => x.hash === head);
  if (!s) return { section: "overview", id: null };
  return { section: s.id, id: s.id === "directory" && id && UUID.test(id) ? id : null };
}

/** Lien vers une section (ou la fiche d'un restaurant). */
export const sectionHref = (section: Section, id?: string | null) => {
  const h = SECTIONS.find((s) => s.id === section)!.hash;
  return `#${h}${id ? `/${id}` : ""}` || "#";
};
export const restaurantHref = (id: string) => sectionHref("directory", id);

export function go(section: Section, id?: string | null) {
  const target = sectionHref(section, id);
  if (location.hash !== target && !(target === "#" && !location.hash)) location.hash = target;
}

const subscribeHash = (l: () => void) => { window.addEventListener("hashchange", l); return () => window.removeEventListener("hashchange", l); };
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => "");
  return parseHash(hash);
}
