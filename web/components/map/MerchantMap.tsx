"use client";

/**
 * Carte Leaflet des commerces de La Roche-sur-Yon.
 * Ce module touche `window` (Leaflet) : il ne doit être chargé que côté navigateur,
 * via <MapView /> (next/dynamic, ssr: false).
 */

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, ZoomControl, useMapEvents } from "react-leaflet";
import { CITY_CENTER, SERVICE_BOUNDS, TILES, ZOOM, isInServiceArea, type LatLng, type MapTheme } from "@/lib/geo/config";
import { CATEGORIES, type MapMerchant } from "@/types/merchant";
import { useGeolocation, type GeoStatus } from "./useGeolocation";
import "./merchant-map.css";

export interface MerchantMapProps {
  merchants: MapMerchant[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Thème contrôlé par le parent ; sinon la carte suit le système et mémorise le choix. */
  theme?: MapTheme;
  onThemeChange?: (theme: MapTheme) => void;
  /** Zones masquées par l'interface (tiroir sur téléphone, panneau latéral sur ordinateur), en pixels. */
  viewportPadding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Position de l'utilisateur (pour le calcul des distances), null tant qu'elle est inconnue. */
  onUserPosition?: (position: LatLng | null) => void;
  /** Appelé quand la localisation est bloquée par le navigateur (pour afficher une aide). */
  onLocationDenied?: () => void;
  /** Affiche les boutons + / − (ordinateur). */
  showZoomControl?: boolean;
  className?: string;
}

const THEME_KEY = "rsf:map-theme";
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initialTheme(): MapTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "day" || saved === "night") return saved;
  } catch {
    /* stockage indisponible (navigation privée) */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pinIcon(m: MapMerchant, selected: boolean) {
  const classes = ["rsf-pin", selected && "rsf-selected", !m.openNow && "rsf-closed"].filter(Boolean).join(" ");
  return L.divIcon({
    className: "rsf-pin-icon",
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    // Le nom vient des commerçants : il est échappé avant d'être inséré dans le HTML du marqueur
    html:
      `<div class="${classes}"><div class="rsf-bubble"><span>${CATEGORIES[m.category].emoji}</span></div>` +
      (m.verified ? `<span class="rsf-verified" aria-hidden="true">✓</span>` : "") +
      `<span class="rsf-label">${escapeHtml(m.name)}</span></div>`,
  });
}

const meIcon = L.divIcon({ className: "rsf-me", iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="rsf-me-dot"></div>` });

/** Centre la carte pour que `target` apparaisse au milieu de la zone réellement visible. */
function focusOn(map: L.Map, target: LatLng, zoom: number, padding: MerchantMapProps["viewportPadding"] = {}) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  const offset = L.point((left - right) / 2, (top - bottom) / 2);
  const center = map.unproject(map.project(target, zoom).subtract(offset), zoom);
  if (prefersReducedMotion()) map.setView(center, zoom);
  else map.flyTo(center, zoom, { duration: 0.8 });
}

/** Clic sur le fond de carte : désélectionne le commerce. */
function BackgroundClick({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: onClick });
  return null;
}

const GEO_MESSAGES: Partial<Record<GeoStatus | "outside", string>> = {
  denied: "Localisation bloquée : autorisez-la dans les réglages du navigateur.",
  unavailable: "Position introuvable pour le moment. Réessayez dans un instant.",
  outside: "Vous êtes en dehors de La Roche-sur-Yon : la carte reste centrée sur la ville.",
};

export default function MerchantMap({
  merchants,
  selectedId = null,
  onSelect,
  theme: controlledTheme,
  onThemeChange,
  viewportPadding,
  onUserPosition,
  onLocationDenied,
  showZoomControl = false,
  className,
}: MerchantMapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [ownTheme, setOwnTheme] = useState<MapTheme>(initialTheme);
  const theme = controlledTheme ?? ownTheme;
  const geo = useGeolocation();
  const [notice, setNotice] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);

  const toggleTheme = () => {
    const next: MapTheme = theme === "day" ? "night" : "day";
    if (controlledTheme === undefined) setOwnTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  // Le parent est informé du thème initial puis de chaque changement
  useEffect(() => {
    onThemeChange?.(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Icônes recalculées seulement quand la liste ou la sélection change
  const icons = useMemo(
    () => new Map(merchants.map((m) => [m.id, pinIcon(m, m.id === selectedId)])),
    [merchants, selectedId],
  );

  // Ouverture d'une fiche : on centre le commerce dans la partie visible de la carte
  const selected = merchants.find((m) => m.id === selectedId);
  const { top, right, bottom, left } = viewportPadding ?? {};
  useEffect(() => {
    if (!map || !selected) return;
    focusOn(map, selected.position, Math.max(map.getZoom(), ZOOM.focus), { top, right, bottom, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on ne recentre qu'au changement de sélection
  }, [map, selected?.id]);

  // Position de l'utilisateur : transmise au parent, suivie si le mode suivi est actif
  const userCoords = geo.position?.coords ?? null;
  useEffect(() => {
    onUserPosition?.(userCoords);
    if (follow && map && userCoords && isInServiceArea(userCoords)) map.panTo(userCoords, { animate: !prefersReducedMotion() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCoords?.[0], userCoords?.[1]]);

  useEffect(() => {
    if (geo.status === "denied") onLocationDenied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status]);

  // Un déplacement manuel de la carte arrête le suivi
  useEffect(() => {
    if (!map) return;
    const stop = () => setFollow(false);
    map.on("dragstart", stop);
    return () => {
      map.off("dragstart", stop);
    };
  }, [map]);

  // Messages éphémères
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const locate = async () => {
    // Chaque clic redemande la position : après un refus, le navigateur peut reposer la question
    const result = geo.position ? { position: geo.position, status: geo.status } : await geo.request();
    const pos = result.position;
    if (!pos) {
      setNotice(GEO_MESSAGES[result.status] ?? null);
      return;
    }
    if (!map) return;
    if (!isInServiceArea(pos.coords)) {
      setNotice(GEO_MESSAGES.outside!);
      focusOn(map, CITY_CENTER, ZOOM.initial, viewportPadding);
      return;
    }
    setFollow(true);
    focusOn(map, pos.coords, Math.max(map.getZoom(), ZOOM.user), viewportPadding);
  };

  const locateState = geo.status === "active" ? (follow ? "follow" : "active") : geo.status;

  return (
    <div className={["rsf-wrap", theme === "night" && "rsf-night", className].filter(Boolean).join(" ")} data-theme={theme}>
      <MapContainer
        ref={setMap}
        className="rsf-map"
        center={CITY_CENTER}
        zoom={ZOOM.initial}
        minZoom={ZOOM.min}
        maxZoom={ZOOM.max}
        maxBounds={SERVICE_BOUNDS}
        maxBoundsViscosity={1}
        zoomControl={false}
        attributionControl
        aria-label="Carte des commerces de La Roche-sur-Yon"
      >
        <TileLayer key={theme} url={TILES[theme].url} attribution={TILES[theme].attribution} maxZoom={ZOOM.max} />
        {showZoomControl && <ZoomControl position="bottomright" />}
        <BackgroundClick onClick={() => onSelect?.(null)} />

        {merchants.map((m) => (
          <Marker
            key={m.id}
            position={m.position}
            icon={icons.get(m.id)!}
            title={m.name}
            alt={`${m.name}, ${CATEGORIES[m.category].label}${m.openNow ? ", ouvert" : ", fermé"}`}
            zIndexOffset={m.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(m.id) }}
            keyboard
          />
        ))}

        {geo.position && (
          <>
            <Circle
              center={geo.position.coords}
              radius={geo.position.accuracy}
              interactive={false}
              pathOptions={{ color: "#1a73e8", weight: 1, opacity: 0.4, fillOpacity: 0.12 }}
            />
            <Marker position={geo.position.coords} icon={meIcon} interactive={false} keyboard={false} zIndexOffset={2000} />
          </>
        )}
      </MapContainer>

      {/* Boutons en haut à droite : localisation et mode jour / nuit */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col gap-2.5 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={locate}
          data-state={locateState}
          aria-label={locateState === "follow" ? "Suivi de votre position activé" : "Me localiser"}
          aria-pressed={locateState === "follow"}
          className={[
            "pointer-events-auto grid size-12 place-items-center rounded-full shadow-md transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
            theme === "night" ? "bg-[#2d3138] text-[#e8eaed]" : "bg-white text-[#5f6368]",
            locateState === "follow" && "!bg-[#1a73e8] !text-white",
            locateState === "active" && (theme === "night" ? "!text-[#8ab4f8]" : "!text-[#1a73e8]"),
            locateState === "denied" && "!text-[#d93025]",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {locateState === "locating" ? (
            <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <circle cx="12" cy="12" r="4" fill={locateState === "active" || locateState === "follow" ? "currentColor" : "none"} />
              <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="7.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "day" ? "Passer en mode nuit" : "Passer en mode jour"}
          className={[
            "pointer-events-auto grid size-11 place-items-center self-center rounded-full shadow-md",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
            theme === "night" ? "bg-[#2d3138] text-[#fdd663]" : "bg-white text-[#5f6368]",
          ].join(" ")}
        >
          {theme === "day" ? (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          )}
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={[
          "pointer-events-none absolute left-1/2 top-20 z-[1000] w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-lg bg-[#323232] px-4 py-3 text-sm text-[#e8eaed] shadow-lg transition-opacity",
          notice ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {notice}
      </p>
    </div>
  );
}
