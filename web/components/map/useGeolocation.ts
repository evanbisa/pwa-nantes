"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo/config";

export type GeoStatus = "idle" | "locating" | "active" | "denied" | "unavailable";

export interface GeoResult {
  position: UserPosition | null;
  status: GeoStatus;
}

export interface UserPosition {
  coords: LatLng;
  /** Précision en mètres. */
  accuracy: number;
}

/**
 * Position de l'utilisateur.
 * - `request()` déclenche la demande d'autorisation (ou la redemande après un refus) ;
 * - si l'autorisation a déjà été donnée, la position reprend toute seule à l'ouverture.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<UserPosition | null>(null);
  const watchId = useRef<number | null>(null);
  const pending = useRef<Promise<GeoResult> | null>(null);

  const stopWatching = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  };

  const startWatching = useCallback(() => {
    if (watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => setPosition({ coords: [p.coords.latitude, p.coords.longitude], accuracy: p.coords.accuracy }),
      () => {}, // les erreurs passagères n'interrompent pas le suivi
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  }, []);

  const request = useCallback((): Promise<GeoResult> => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return Promise.resolve({ position: null, status: "unavailable" });
    }
    if (pending.current) return pending.current; // une seule demande à la fois
    setStatus("locating");
    pending.current = new Promise<GeoResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const next = { coords: [p.coords.latitude, p.coords.longitude] as LatLng, accuracy: p.coords.accuracy };
          setPosition(next);
          setStatus("active");
          startWatching();
          resolve({ position: next, status: "active" });
        },
        (err) => {
          const failed: GeoStatus = err.code === err.PERMISSION_DENIED ? "denied" : "unavailable";
          setStatus(failed);
          resolve({ position: null, status: failed });
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    }).finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, [startWatching]);

  // Autorisation déjà accordée lors d'une visite précédente : on reprend sans redemander
  useEffect(() => {
    let cancelled = false;
    let watched: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((perm) => {
        if (cancelled) return;
        watched = perm;
        if (perm.state === "granted") request();
        else if (perm.state === "denied") setStatus("denied");
        perm.onchange = () => {
          if (perm.state === "granted") request();
          if (perm.state === "denied") {
            stopWatching();
            setStatus("denied");
          }
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watched) watched.onchange = null;
      stopWatching();
    };
  }, [request]);

  return { status, position, request };
}
