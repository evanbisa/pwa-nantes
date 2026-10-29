"use client";

import { useEffect, useMemo, useState } from "react";
import MapView from "@/components/map/MapView";
import type { LatLng, MapTheme } from "@/lib/geo/config";
import { directionsUrl, distanceMeters, drivingMinutes, formatDistance, walkingMinutes } from "@/lib/geo/distance";
import { CATEGORIES, type MapMerchant, type MerchantCategory } from "@/types/merchant";

/**
 * Écran d'accueil provisoire : carte + filtres + aperçu du commerce sélectionné.
 * La fiche complète (tiroir sur téléphone, panneau latéral sur ordinateur) arrive à l'étape suivante.
 */
export default function HomeMap({ merchants }: { merchants: MapMerchant[] }) {
  const [category, setCategory] = useState<MerchantCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [theme, setTheme] = useState<MapTheme>("day");
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const visible = useMemo(
    () => (category === "all" ? merchants : merchants.filter((m) => m.category === category)),
    [merchants, category],
  );
  const selected = visible.find((m) => m.id === selectedId) ?? null;
  const distance = selected && me ? distanceMeters(me, selected.position) : null;

  return (
    // Le mode jour / nuit choisi sur la carte s'applique à toute l'interface (variante Tailwind « dark »)
    <div className="relative h-full w-full" data-theme={theme}>
      <MapView
        merchants={visible}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        onUserPosition={setMe}
        onThemeChange={setTheme}
        showZoomControl={isDesktop}
        // la carte centre le commerce dans la partie non couverte par l'aperçu
        viewportPadding={isDesktop ? { left: 400 } : { bottom: 220 }}
      />

      {/* Filtres par catégorie */}
      <nav
        aria-label="Catégories"
        // sur téléphone, l'aperçu du commerce prend la place des filtres
        className={`${selected ? "max-md:hidden " : ""}absolute inset-x-0 bottom-7 z-[1000] flex gap-2 overflow-x-auto px-3 pb-[env(safe-area-inset-bottom)] [scrollbar-width:none] md:bottom-auto md:left-3 md:right-20 md:top-3 md:flex-wrap`}
      >
        {(["all", ...Object.keys(CATEGORIES)] as const).map((key) => {
          const active = category === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCategory(key as MerchantCategory | "all");
                setSelectedId(null);
              }}
              className={[
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium shadow-sm",
                active
                  ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1967d2] dark:border-[#8ab4f8] dark:bg-[#394457] dark:text-[#d2e3fc]"
                  : "border-black/10 bg-white text-[#3c4043] dark:border-white/10 dark:bg-[#2d3138] dark:text-[#e8eaed]",
              ].join(" ")}
            >
              {key === "all" ? "Tout" : `${CATEGORIES[key as MerchantCategory].emoji} ${CATEGORIES[key as MerchantCategory].label}`}
            </button>
          );
        })}
      </nav>

      {/* Aperçu du commerce sélectionné */}
      {selected && (
        <section
          aria-label={selected.name}
          className="absolute inset-x-0 bottom-0 z-[1001] rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.15)] dark:bg-[#202124] md:inset-x-auto md:bottom-auto md:left-4 md:top-16 md:w-[380px] md:rounded-2xl md:pb-5"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-black/5 text-2xl dark:bg-white/10" aria-hidden>
              {CATEGORIES[selected.category].emoji}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl">{selected.name}</h2>
              <p className="text-sm text-[#5f6368] dark:text-[#9aa0a6]">
                {CATEGORIES[selected.category].label}
                {selected.verified && <span className="ml-2 rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-medium text-[#188038]">✓ Vérifié</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Fermer"
              className="grid size-9 place-items-center rounded-full bg-black/5 text-xl text-[#5f6368] dark:bg-white/10 dark:text-[#9aa0a6]"
            >
              ×
            </button>
          </div>
          <p className={`mt-3 text-sm font-medium ${selected.openNow ? "text-[#188038]" : "text-[#d93025]"}`}>
            {selected.openNow ? "Ouvert" : "Fermé"}
          </p>
          <p className="mt-1 text-sm text-[#3c4043] dark:text-[#e8eaed]">
            {distance !== null ? (
              <>
                {`${formatDistance(distance)} · environ ${walkingMinutes(distance)} min à pied`}
                <span className="block text-[#5f6368] dark:text-[#9aa0a6]">🚗 environ {drivingMinutes(distance)} min en voiture</span>
              </>
            ) : (
              "Activez la localisation pour connaître la distance et les temps de trajet"
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <a
              href={directionsUrl(selected.position, "walking")}
              target="_blank"
              rel="noopener"
              aria-label={`Itinéraire à pied vers ${selected.name}`}
              className="flex h-12 items-center justify-center rounded-full bg-[#1a73e8] font-medium text-white hover:bg-[#1765cc]"
            >
              À pied
            </a>
            <a
              href={directionsUrl(selected.position, "driving")}
              target="_blank"
              rel="noopener"
              aria-label={`Itinéraire en voiture vers ${selected.name}`}
              className="flex h-12 items-center justify-center rounded-full border border-black/15 font-medium text-[#1a73e8] hover:bg-[#e8f0fe] dark:border-white/15 dark:text-[#8ab4f8] dark:hover:bg-white/5"
            >
              En voiture
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}
