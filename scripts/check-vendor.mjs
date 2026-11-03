#!/usr/bin/env node
/**
 * Failles connues des bibliothèques copiées dans le site (dossier vendor/ : MapLibre, supabase-js, QR codes).
 * Ces fichiers ne passent pas par npm, donc ni « npm audit » ni Dependabot ne les surveillent : ce script retrouve leur
 * version (nom du fichier ou du dossier), interroge la base des failles de npm pour exactement ces versions et indique
 * aussi la dernière version publiée.
 * Lancé chaque semaine par GitHub Actions (.github/workflows/dependances.yml) ; en local : node scripts/check-vendor.mjs [dossier]
 *
 * Sortie : code 1 si une faille de gravité moyenne ou plus est connue (il faut alors changer de version : nouveau dossier
 * vendor/<nom>-<version>, adresses dans index.html, puis « node scripts/csp.mjs » et le nom du cache dans sw.js).
 * Pour changer de version, préférer une version publiée depuis au moins deux semaines (une version piégée par un pirate
 * est en général repérée et retirée en quelques jours), sauf faille grave déjà exploitée.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VENDOR = process.argv[2] ?? new URL("../vendor/", import.meta.url).pathname;
/** Nom dans vendor/ → paquet npm. */
const PACKAGES = [
  [/^maplibre-gl-(\d+\.\d+\.\d+)$/, "maplibre-gl"],
  [/^supabase-js-(\d+\.\d+\.\d+)\.js$/, "@supabase/supabase-js"],
  [/^qrcode-generator-(\d+\.\d+\.\d+)$/, "qrcode-generator"],
  [/^jsqr-(\d+\.\d+\.\d+)$/, "jsqr"],
];
const LEVELS = ["info", "low", "moderate", "high", "critical"];
const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const found = {};
for (const name of readdirSync(VENDOR)) {
  for (const [re, pkg] of PACKAGES) {
    const m = name.match(re);
    if (m) found[pkg] = m[1];
  }
}
const missing = PACKAGES.map(([, pkg]) => pkg).filter((pkg) => !found[pkg]);
if (missing.length) { console.error(`check-vendor : version introuvable dans vendor/ pour ${missing.join(", ")}`); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), "vendor-audit-"));
let failures = 0;
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "vendor-audit", private: true, dependencies: found }, null, 2));
  npm(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
  let report;
  try {
    report = JSON.parse(npm(["audit", "--json"], dir));
  } catch (e) {
    report = JSON.parse(e.stdout || "{}"); // npm audit sort en code 1 quand il trouve une faille
  }
  if (!report.metadata) throw new Error("réponse de npm audit illisible");
  for (const [pkg, version] of Object.entries(found)) {
    const latest = npm(["view", pkg, "version"], dir).trim();
    console.log(`${pkg} ${version} (dernière version publiée : ${latest}${latest === version ? ", à jour" : ""})`);
  }
  for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    const serious = LEVELS.indexOf(v.severity) >= LEVELS.indexOf("moderate");
    if (serious) failures++;
    const titles = (v.via ?? []).filter((x) => typeof x === "object").map((x) => `${x.title} (${x.url})`);
    console.log(`${serious ? "✘" : "•"} ${name} : faille ${v.severity} ${titles.join(" ; ") || "(via " + (v.via ?? []).join(", ") + ")"}`);
  }
  const total = report.metadata.vulnerabilities?.total ?? 0;
  console.log(total ? `\n${total} faille(s) connue(s), dont ${failures} de gravité moyenne ou plus` : "\n✔ Aucune faille connue dans les bibliothèques de vendor/");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
