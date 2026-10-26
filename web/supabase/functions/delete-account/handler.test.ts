// Tests de la fonction delete-account, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { BUCKETS, handle, type Deps } from "./handler.ts";

function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { removed: [] as string[], deleted: [] as string[], billing: [] as string[] };
  const deps: Deps = {
    getUserId: (t) => Promise.resolve(t === "jeton-valide" ? "user-1" : null),
    getMerchantId: () => Promise.resolve("merchant-1"),
    stopBilling: (m) => { calls.billing.push(m); return Promise.resolve(); },
    removeFolder: (b, f) => { calls.removed.push(b + "/" + f); return Promise.resolve(); },
    deleteUser: (id) => { calls.deleted.push(id); return Promise.resolve(); },
    ...over,
  };
  return { deps, calls };
}
const req = ({ token = "jeton-valide", method = "POST" } = {}) =>
  new Request("https://x.supabase.co/functions/v1/delete-account", { method, headers: { Authorization: `Bearer ${token}`, Origin: "https://pwa-nantes.vercel.app" } });

Deno.test("supprime les fichiers de la fiche puis le compte", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handle(req(), deps);
  assertEquals(res.status, 200);
  assertEquals(calls.billing, ["merchant-1"]);   // renouvellement Whop arrêté avant tout
  assertEquals(calls.removed, BUCKETS.map((b) => b + "/merchant-1"));
  assertEquals(calls.deleted, ["user-1"]);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://pwa-nantes.vercel.app");
});
Deno.test("compte client (sans fiche) : seul le compte est supprimé", async () => {
  const { deps, calls } = fakeDeps({ getMerchantId: () => Promise.resolve(null) });
  assertEquals((await handle(req(), deps)).status, 200);
  assertEquals([calls.removed.length, calls.deleted], [0, ["user-1"]]);
});
Deno.test("sans session valide : refus, rien n'est supprimé", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await handle(req({ token: "faux" }), deps)).status, 401);
  assertEquals([calls.removed.length, calls.deleted.length], [0, 0]);
  assertEquals((await handle(req({ method: "GET" }), deps)).status, 405);
});
Deno.test("abonnement Whop impossible à résilier : le compte n'est pas supprimé (aucun prélèvement orphelin)", async () => {
  const { deps, calls } = fakeDeps({ stopBilling: () => Promise.reject(new Error("Whop injoignable")) });
  const res = await handle(req(), deps);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "billing");
  assertEquals([calls.removed.length, calls.deleted.length], [0, 0]);
});
