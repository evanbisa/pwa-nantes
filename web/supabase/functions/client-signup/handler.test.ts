// Tests de la fonction client-signup, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { handle, mailVerdict, type Deps } from "./handler.ts";

const NOW = new Date("2026-10-25T12:00:00Z");
function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { created: [] as { email: string; password: string; metadata: Record<string, string> }[], attempts: [] as string[], dns: [] as string[] };
  const deps: Deps = {
    mailDomain: (d) => { calls.dns.push(d); return Promise.resolve(d === "gmial.com" ? "none" : "ok"); },
    attempt: (h, k) => { calls.attempts.push(h + ":" + k); return Promise.resolve(true); },
    hashIp: (ip) => Promise.resolve("empreinte-" + ip.padEnd(8, "-")),
    createUser: (u) => { calls.created.push(u); return Promise.resolve("created"); },
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}
const SIGNUP = { action: "signup", email: "Lea.Martin@Univ-Nantes.fr ", password: "Motdepasse1!", first_name: " Léa ", gender: "female", birth_year: "2005" };
const req = (body: unknown, { method = "POST", origin = "https://pwa-nantes.vercel.app", ip = "203.0.113.7" } = {}) =>
  new Request("https://x.supabase.co/functions/v1/client-signup", {
    method, headers: { Origin: origin, "x-forwarded-for": ip + ", 10.0.0.1", "Content-Type": "application/json" },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
const call = async (body: unknown, deps: Deps, opts = {}) => { const r = await handle(req(body, opts), deps); return { status: r.status, body: await r.json(), res: r }; };

Deno.test("inscription : compte client créé déjà confirmé, adresse en minuscules, prénom nettoyé", async () => {
  const { deps, calls } = fakeDeps();
  const { status, body, res } = await call(SIGNUP, deps);
  assertEquals([status, body], [200, { created: true }]);
  assertEquals(calls.created, [{ email: "lea.martin@univ-nantes.fr", password: "Motdepasse1!", metadata: { role: "student", first_name: "Léa", gender: "female", birth_year: "2005" } }]);
  assertEquals(calls.dns, ["univ-nantes.fr"]);
  assertEquals(calls.attempts, ["empreinte-203.0.113.7:signup"]);   // première adresse de la liste, jamais en clair
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://pwa-nantes.vercel.app");
});
Deno.test("adresse IP posée par la passerelle prioritaire : un X-Forwarded-For inventé ne contourne pas le plafond", async () => {
  const { deps, calls } = fakeDeps();
  for (const forged of ["198.51.100.1", "198.51.100.2"]) {
    const r = new Request("https://x.supabase.co/functions/v1/client-signup", {
      method: "POST", headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": forged + ", 203.0.113.9" }, body: JSON.stringify({ action: "check", email: "lea@gmail.com" }),
    });
    await handle(r, deps);
  }
  assertEquals(calls.attempts, ["empreinte-203.0.113.9:check", "empreinte-203.0.113.9:check"]);
});
Deno.test("le rôle est toujours « client » : impossible de créer un restaurateur ou un administrateur", async () => {
  const { deps, calls } = fakeDeps();
  await call({ ...SIGNUP, role: "merchant", metadata: { role: "admin" } }, deps);
  assertEquals(calls.created[0].metadata.role, "student");
});
Deno.test("domaine qui ne reçoit pas d'e-mails (faute de frappe) : refus, aucun compte", async () => {
  const { deps, calls } = fakeDeps();
  const { status, body } = await call({ ...SIGNUP, email: "lea@gmial.com" }, deps);
  assertEquals([status, body.error], [422, "email_domain"]);
  assertEquals(calls.created.length, 0);
});
Deno.test("messagerie connue : pas d'interrogation DNS ; DNS indisponible : l'inscription continue", async () => {
  const { deps, calls } = fakeDeps({ mailDomain: () => Promise.resolve("unknown") });
  assertEquals((await call({ ...SIGNUP, email: "lea@gmail.com" }, deps)).status, 200);
  assertEquals((await call({ ...SIGNUP, email: "lea@exemple-rare.fr" }, deps)).status, 200);
  assertEquals(calls.created.length, 2);
});
Deno.test("vérification seule de l'adresse (étape e-mail) : rien n'est créé", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await call({ action: "check", email: "lea@univ-nantes.fr" }, deps)).body, { ok: true });
  assertEquals((await call({ action: "check", email: "lea@gmial.com" }, deps)).body.error, "email_domain");
  assertEquals([calls.created.length, calls.attempts], [0, ["empreinte-203.0.113.7:check", "empreinte-203.0.113.7:check"]]);
});
Deno.test("adresse, mot de passe, prénom, âge invalides : refus avant toute tentative comptée", async () => {
  const { deps, calls } = fakeDeps();
  for (const [patch, code] of [
    [{ email: "lea@" }, "email_invalid"], [{ email: "lea martin@gmail.com" }, "email_invalid"], [{ email: "lea@gmail" }, "email_invalid"],
    [{ email: "a".repeat(250) + "@gmail.com" }, "email_invalid"],
    [{ password: "motdepasse1!" }, "weak_password"], [{ password: "Motdepasse!" }, "weak_password"], [{ password: "Motdepasse1" }, "weak_password"],
    [{ password: "Mo1!" }, "weak_password"], [{ password: "Aa1!" + "x".repeat(70) }, "weak_password"],
    [{ first_name: "L" }, "invalid_name"], [{ first_name: "<script>" }, "invalid_name"], [{ first_name: 42 }, "invalid_name"],
    [{ gender: "robot" }, "invalid"], [{ birth_year: "2015" }, "invalid_age"], [{ birth_year: "1900" }, "invalid_age"], [{ birth_year: "20O5" }, "invalid_age"],
  ] as [Record<string, unknown>, string][]) {
    const { status, body } = await call({ ...SIGNUP, ...patch }, deps);
    assertEquals([status >= 400 && status < 500, body.error], [true, code], JSON.stringify(patch));
  }
  assertEquals([calls.created.length, calls.attempts.length], [0, 0]);
});
Deno.test("15 ans tout juste : accepté ; sexe et âge facultatifs", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await call({ ...SIGNUP, birth_year: "2011" }, deps)).status, 200);
  assertEquals((await call({ action: "signup", email: "hugo@gmail.com", password: "Motdepasse1!", first_name: "Hugo" }, deps)).status, 200);
  assertEquals(calls.created[1].metadata, { role: "student", first_name: "Hugo" });
});
Deno.test("compte déjà existant : 409 ; mot de passe refusé par Supabase : 422", async () => {
  assertEquals((await call(SIGNUP, fakeDeps({ createUser: () => Promise.resolve("exists") }).deps)).status, 409);
  assertEquals((await call(SIGNUP, fakeDeps({ createUser: () => Promise.resolve("weak") }).deps)).body.error, "weak_password");
});
Deno.test("trop de tentatives depuis la même connexion : 429, aucun compte", async () => {
  const { deps, calls } = fakeDeps({ attempt: () => Promise.resolve(false) });
  const { status, body } = await call(SIGNUP, deps);
  assertEquals([status, body.error, calls.created.length, calls.dns.length], [429, "rate_limited", 0, 0]);
});
Deno.test("demande illisible, trop longue, action inconnue, mauvaise méthode ; site non autorisé sans en-tête CORS", async () => {
  const { deps } = fakeDeps();
  assertEquals((await call("pas du json", deps)).status, 400);
  assertEquals((await call([1, 2], deps)).status, 400);
  assertEquals((await call({ ...SIGNUP, first_name: "x".repeat(5000) }, deps)).status, 400);
  assertEquals((await call({ ...SIGNUP, action: "admin" }, deps)).status, 400);
  assertEquals((await handle(req(null, { method: "GET" }), deps)).status, 405);
  const { res } = await call(SIGNUP, deps, { origin: "https://pirate.example" });
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
});
Deno.test("panne du serveur : message générique, sans détail", async () => {
  const { status, body } = await call(SIGNUP, fakeDeps({ createUser: () => Promise.reject(new Error("base indisponible : détail interne")) }).deps);
  assertEquals([status, body.error, body.message.includes("détail")], [500, "server", false]);
});
Deno.test("verdict DNS : MX, MX nul, domaine inexistant, adresse seule, réponse impossible", () => {
  assertEquals(mailVerdict({ Status: 0, Answer: [{ type: 15, data: "10 mx.gmail.com." }] }, null), "ok");
  assertEquals(mailVerdict({ Status: 0, Answer: [{ type: 15, data: "0 ." }] }, null), "none");
  assertEquals(mailVerdict({ Status: 3 }, null), "none");
  assertEquals(mailVerdict({ Status: 0, Answer: [] }, { Status: 0, Answer: [{ type: 1 }] }), "ok");
  assertEquals(mailVerdict({ Status: 0, Answer: [{ type: 5, data: "alias." }] }, { Status: 0, Answer: [] }), "none");
  assertEquals(mailVerdict({ Status: 2 }, null), "unknown");
  assertEquals(mailVerdict(null, null), "unknown");
  assertEquals(mailVerdict({ Status: 0 }, null), "unknown");
});
