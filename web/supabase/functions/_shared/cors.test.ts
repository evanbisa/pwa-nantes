// Tests des sites autorisés (CORS), sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { corsHeaders, isAllowedOrigin } from "./cors.ts";

Deno.test("CORS : seules les adresses de production de FlashMiam sont autorisées", () => {
  for (const ok of ["https://pwa-nantes.vercel.app", "https://roche-street-food.pages.dev", "https://abc123.roche-street-food.pages.dev", "https://evanbisa.github.io"]) {
    assertEquals(isAllowedOrigin(ok), true, ok);
  }
  for (const ko of [null, "", "null", "https://pirate.example", "http://pwa-nantes.vercel.app", "https://pwa-nantes.vercel.app.pirate.example",
    "https://pwa-nantes-pirate.vercel.app", "https://evanbisa.github.io.evil.com", "https://roche-street-food.pages.dev:8443"]) {
    assertEquals(isAllowedOrigin(ko), false, String(ko));
  }
  assertEquals(corsHeaders("https://pirate.example")["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders("https://pwa-nantes.vercel.app")["Access-Control-Allow-Origin"], "https://pwa-nantes.vercel.app");
});

Deno.test("CORS : localhost refusé en ligne, accepté seulement dans la copie de test (CORS_ALLOW_LOCALHOST=1)", () => {
  const before = Deno.env.get("CORS_ALLOW_LOCALHOST");
  try {
    Deno.env.delete("CORS_ALLOW_LOCALHOST");
    assertEquals(isAllowedOrigin("http://localhost:8765"), false);
    Deno.env.set("CORS_ALLOW_LOCALHOST", "1");
    assertEquals([isAllowedOrigin("http://localhost:8765"), isAllowedOrigin("http://127.0.0.1:3000")], [true, true]);
    assertEquals(isAllowedOrigin("http://localhost.pirate.example:80"), false);
  } finally {
    if (before === undefined) Deno.env.delete("CORS_ALLOW_LOCALHOST");
    else Deno.env.set("CORS_ALLOW_LOCALHOST", before);
  }
});
