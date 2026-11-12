/**
 * Lecture des photos de carte par Claude (API Anthropic), avec une réponse JSON imposée par un schéma.
 * La clé (secret ANTHROPIC_API_KEY de Supabase) est lue par le SDK : elle n'est écrite nulle part.
 */
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import type { MenuImage } from "./handler.ts";

export const MODEL = "claude-opus-5-5";

export const SYSTEM_PROMPT = `Tu lis des photos de la carte d'un restaurant de street-food en France et tu en tires la liste des plats, pour remplir automatiquement la carte en ligne du restaurant. Le restaurateur relira et corrigera le résultat avant de le publier.

Règles :
- Un élément par plat ou boisson qui a un prix sur la carte, dans l'ordre de la carte. Les photos peuvent montrer plusieurs pages ou deux fois la même page : ne mets chaque plat qu'une fois.
- section : la rubrique telle qu'elle est écrite sur la carte (« Burgers », « Tacos », « Desserts », « Boissons »…), 30 caractères au plus, avec une majuscule au début seulement. Vide si la carte n'a pas de rubriques.
- name : le nom du plat tel qu'il est écrit, 60 caractères au plus, en écriture normale (pas tout en majuscules), sans le prix.
- Plusieurs tailles ou formules au prix différent (seul / en menu, M / L / XL, 33 cl / 50 cl) : un élément par prix, la taille ou la formule à la fin du nom (« Tacos M », « Cheese burger — menu »).
- price : le prix en euros, en nombre (9.5 pour « 9,50 € »). null si tu ne le lis pas avec certitude : n'invente jamais un prix.
- desc : les ingrédients ou le détail écrits sous le plat, raccourcis à 120 caractères au plus ; vide s'il n'y en a pas.
- Suppléments et sauces payants : dans la rubrique « Suppléments » s'ils ont un prix.
- Ignore tout ce qui n'est pas un plat : horaires, adresse, téléphone, réseaux sociaux, allergènes en bas de page, slogans.
- 80 éléments au plus. Si les photos ne montrent pas une carte de restaurant, renvoie une liste vide.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          name: { type: "string" },
          price: { anyOf: [{ type: "number" }, { type: "null" }] },
          desc: { type: "string" },
        },
        required: ["section", "name", "price", "desc"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export function makeExtractor(): (images: MenuImage[]) => Promise<{ items: unknown; refused?: boolean }> {
  // Lit ANTHROPIC_API_KEY dans l'environnement. Une nouvelle tentative au plus ; 2 minutes au plus par appel.
  const client = new Anthropic({ maxRetries: 1, timeout: 120_000 });
  return async (images) => {
    const n = images.length;
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // En cas de refus par un filtre de sécurité, la même demande est reprise par un autre modèle.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType, data: im.data } })),
          { type: "text" as const, text: n > 1 ? `Voici ${n} photos de la même carte. Donne la liste des plats.` : "Voici la carte. Donne la liste des plats." },
        ],
      }],
    });
    if (response.stop_reason === "refusal") return { items: [], refused: true };
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).pop() ?? "";
    if (response.stop_reason === "max_tokens") throw new Error("réponse coupée (max_tokens)");
    const parsed = JSON.parse(text) as { items?: unknown };
    return { items: parsed.items ?? [] };
  };
}
