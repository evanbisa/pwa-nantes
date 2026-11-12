/**
 * Carte lue sur photo : le restaurateur envoie 1 à 5 photos de sa carte, la fonction renvoie la liste des plats
 * (rubrique, nom, prix, détail) à relire dans l'éditeur avant d'enregistrer sa fiche. Rien n'est enregistré dans la
 * fiche ici, et les photos ne sont jamais stockées (seule une ligne de comptage, pour limiter les lectures).
 * Logique pure, testable : l'accès à la base et à l'IA passe par `deps`.
 */
import { corsHeaders } from "../_shared/cors.ts";

export interface MenuItem { section: string; name: string; price: number | null; desc: string }
export interface MenuImage { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }

export interface Deps {
  getUserId(token: string): Promise<string | null>;
  /** Fiche du restaurateur connecté (null si ce compte n'en a pas). */
  getMerchantId(userId: string): Promise<string | null>;
  countScansSince(merchantId: string, sinceIso: string): Promise<number>;
  /** Note une lecture ; renvoie son identifiant pour y ajouter ensuite le nombre de plats lus. */
  recordScan(merchantId: string, images: number): Promise<number>;
  finishScan(scanId: number, items: number | null): Promise<void>;
  /** Lit les photos ; `refused` si l'IA a refusé de répondre. */
  extract(images: MenuImage[]): Promise<{ items: unknown; refused?: boolean }>;
  /** La clé de l'IA est-elle réglée ? */
  configured: boolean;
  now?(): Date;
}

export const MAX_IMAGES = 5;
export const MAX_ITEMS = 80;                      // comme la règle de la base (is_valid_menu)
export const DAILY_SCANS = 15;                    // lectures par 24 heures et par fiche
const MAX_IMAGE_CHARS = 3_000_000;                // ≈ 2,2 Mo par photo (le site les réduit à moins de 1 Mo)
const MAX_TOTAL_CHARS = 9_000_000;
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "";

/** Remet en forme ce que l'IA a lu : longueurs de la base, prix entre 0 et 999,99 € (sinon vide, à compléter). */
export function sanitizeItems(raw: unknown): MenuItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const name = clean(o.name, 60);
    if (name.length < 2) continue;
    let price: number | null = null;
    const p = typeof o.price === "string" ? Number(o.price.replace(",", ".").replace(/[^\d.]/g, "")) : o.price;
    if (typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 999.99) price = Math.round(p * 100) / 100;
    out.push({ section: clean(o.section, 30), name, price, desc: clean(o.desc, 120) });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  const error = (status: number, code: string, message: string) => json(status, { error: code, message });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return error(405, "method", "Méthode non autorisée.");

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = token ? await deps.getUserId(token) : null;
  if (!userId) return error(401, "unauthenticated", "Connectez-vous pour lire votre carte.");
  if (!deps.configured) return error(503, "not_configured", "La lecture de carte sur photo n'est pas encore activée. Ajoutez vos plats à la main pour le moment.");

  let body: { images?: unknown };
  try { body = await req.json(); } catch { return error(400, "bad_request", "Photos illisibles : réessayez."); }
  const list = Array.isArray(body?.images) ? body.images : [];
  if (!list.length) return error(400, "no_image", "Ajoutez au moins une photo de votre carte.");
  if (list.length > MAX_IMAGES) return error(400, "too_many", `${MAX_IMAGES} photos au plus par lecture.`);
  const images: MenuImage[] = [];
  let total = 0;
  for (const im of list) {
    const o = (im ?? {}) as Record<string, unknown>;
    const mediaType = String(o.mediaType ?? ""), data = String(o.data ?? "");
    if (!MEDIA_TYPES.has(mediaType) || !data || !BASE64.test(data)) return error(400, "bad_image", "Une des photos n'est pas une image (JPEG, PNG ou WebP).");
    if (data.length > MAX_IMAGE_CHARS) return error(413, "too_big", "Une des photos est trop lourde : réessayez avec une photo plus petite.");
    total += data.length;
    images.push({ mediaType: mediaType as MenuImage["mediaType"], data });
  }
  if (total > MAX_TOTAL_CHARS) return error(413, "too_big", "Photos trop lourdes au total : envoyez-en moins à la fois.");

  const merchantId = await deps.getMerchantId(userId);
  if (!merchantId) return error(403, "not_merchant", "Réservé aux restaurateurs ayant une fiche.");

  const now = deps.now ? deps.now() : new Date();
  const since = new Date(now.getTime() - 24 * 3600e3).toISOString();
  if (await deps.countScansSince(merchantId, since) >= DAILY_SCANS) {
    return error(429, "rate_limited", `Vous avez déjà lu ${DAILY_SCANS} cartes aujourd'hui. Réessayez demain, ou complétez la carte à la main.`);
  }
  const scanId = await deps.recordScan(merchantId, images.length);

  let raw: { items: unknown; refused?: boolean };
  try {
    raw = await deps.extract(images);
  } catch (e) {
    console.error("menu-scan: lecture impossible", e instanceof Error ? e.message : e);
    await deps.finishScan(scanId, null).catch(() => {});
    return error(502, "ai_error", "La lecture de la carte n'a pas abouti. Réessayez dans un instant.");
  }
  if (raw.refused) {
    await deps.finishScan(scanId, null).catch(() => {});
    return error(422, "refused", "Ces photos n'ont pas pu être lues. Photographiez uniquement votre carte.");
  }
  const items = sanitizeItems(raw.items);
  await deps.finishScan(scanId, items.length).catch(() => {});
  if (!items.length) {
    return error(422, "empty", "Aucun plat n'a été trouvé sur ces photos. Prenez la carte à plat, en entier, bien éclairée et nette.");
  }
  const rawCount = Array.isArray(raw.items) ? raw.items.length : 0;
  return json(200, { items, truncated: rawCount > MAX_ITEMS, missingPrices: items.filter((i) => i.price === null).length });
}
