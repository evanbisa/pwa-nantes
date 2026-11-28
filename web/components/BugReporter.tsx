"use client";

import { useEffect } from "react";

/**
 * Bugs vus sur l'appareil (inscription, pages juridiques, tableau de bord), pour l'onglet « Bugs » du tableau de bord
 * de l'équipe. Même règle que la carte (BugReport dans ../index.html) : erreurs JavaScript non rattrapées, sans rien
 * qui désigne la personne ou l'appareil (message, fichier, page sans ses paramètres, type d'appareil, navigateur,
 * version publiée) ; au plus 10 envois par visite, un seul par bug ; bruit ignoré (extensions, autres sites, réseau).
 *
 * Vitesse (audit du 28/11/2026) : le client Supabase (61 Ko compressés) n'est chargé qu'au premier bug à envoyer.
 * Importé ici d'office, il était téléchargé et exécuté sur toutes les pages, y compris les pages juridiques qui ne
 * s'en servent pas (l'inscription et le tableau de bord le chargent de toute façon pour eux-mêmes).
 */
const MAX = 10;
const IGNORE = /^(Script error\.?|ResizeObserver loop|Failed to fetch|Load failed|NetworkError when attempting|network error|The operation was aborted|AbortError|TimeoutError|cancelled)/i;
const EXTENSION = /(chrome|moz|safari(-web)?)-extension:|webkit-masked-url/;
const VERSION_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/../version.txt`;

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function browser() {
  const ua = navigator.userAgent;
  const app = /(Instagram|FBAN|FBAV|TikTok|Snapchat)/.exec(ua);
  if (app) return app[1].startsWith("FB") ? "Facebook" : app[1];
  const known: [string, RegExp][] = [
    ["Samsung", /SamsungBrowser\/(\d+)/], ["Edge", /Edg(?:A|iOS)?\/(\d+)/], ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["Chrome", /(?:Chrome|CriOS)\/(\d+)/], ["Safari", /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/],
  ];
  for (const [name, re] of known) {
    const v = re.exec(ua);
    if (v) return `${name} ${v[1]}`;
  }
  return /AppleWebKit/.test(ua) ? "WebKit" : "Autre";
}

export default function BugReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;
    let release: Promise<string | null> | null = null;
    const version = () =>
      (release ??= fetch(VERSION_URL, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""), () => "")
        .then((t) => (/^[0-9a-f]{7,40}$/.test(t.trim()) ? t.trim() : null)));

    const send = (kind: "js" | "promise", raw: string, source: string, stack?: string) => {
      const message = raw.trim();
      if (!message || IGNORE.test(message) || sent >= MAX || navigator.onLine === false) return;
      if (stack && EXTENSION.test(stack)) return;
      const key = `${kind}|${message.slice(0, 200)}|${source.replace(/(:\d+)+$/, "")}`;
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      void Promise.all([version(), import("@/lib/supabase/site-session")])
        .then(([rel, { siteClient }]) => siteClient().rpc("report_client_error", {
          p_kind: kind, p_app: "app", p_message: message.slice(0, 1000), p_source: source.slice(0, 1000) || null,
          p_stack: stack?.slice(0, 4000) || null, p_page: location.pathname, p_platform: platform(), p_browser: browser(), p_release: rel,
        }))
        .then(() => {}, () => {});
    };

    const onError = (e: ErrorEvent) => {
      if (!e.error && !e.message) return;
      if (e.filename && !e.filename.startsWith(location.origin)) return;
      send("js", e.message || String(e.error), e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : "", e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: unknown = e.reason;
      if (!r) return;
      if (r instanceof Error) {
        if (/AbortError|TimeoutError/.test(r.name)) return;
        send("promise", `${r.name && r.name !== "Error" ? `${r.name}: ` : ""}${r.message}`, "", r.stack);
      } else {
        send("promise", typeof r === "string" ? r : JSON.stringify(r).slice(0, 300), "");
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
