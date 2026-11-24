#!/usr/bin/env node
/**
 * Vérifie qu'aucun identifiant (id="…") n'apparaît deux fois dans une page : avec un doublon, document.getElementById
 * renvoie le premier élément et un formulaire peut lire le mauvais champ sans aucune erreur visible.
 * Usage : node scripts/check-ids.mjs index.html [autres pages…]
 */
import { readFileSync } from "node:fs";

let failed = false;
for (const file of process.argv.slice(2)) {
  const html = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const seen = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1);
  if (dupes.length) {
    failed = true;
    console.error(`✘ ${file} : identifiants en double → ${dupes.map(([id, n]) => `${id} (${n} fois)`).join(", ")}`);
  } else console.log(`ids : ${file} — ${seen.size} identifiants, aucun doublon`);
}
process.exit(failed ? 1 : 0);
