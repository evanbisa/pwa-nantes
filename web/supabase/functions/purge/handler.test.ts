// Tests de la fonction purge, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle, RULES, SESSION_IDLE_DAYS, SESSION_MAX_DAYS, STORY_KEEP_DAYS, UNCONFIRMED_DAYS } from "./handler.ts";

const NOW = new Date("2026-10-24T03:17:00Z");
function fakeDeps(over: Partial<Deps> = {}, stories = 0) {
  const calls = { deletes: [] as string[], removed: [] as string[], storyIds: [] as string[], marked: 0, before: "", sessions: [] as number[][], unconfirmed: [] as number[] };
  let left = Array.from({ length: stories }, (_, i) => ({ id: "s" + i, image_path: i % 2 ? null : "m1/s" + i + ".jpg" }));
  const deps: Deps = {
    checkToken: (t) => Promise.resolve(t === TOKEN),
    expireSessions: (idle, max) => { calls.sessions.push([idle, max]); return Promise.resolve(3); },
    purgeUnconfirmed: (days) => { calls.unconfirmed.push(days); return Promise.resolve(2); },
    lastRun: () => Promise.resolve(null),
    markRun: () => { calls.marked++; return Promise.resolve(); },
    deleteOlder: (t, c, b) => { calls.deletes.push(`${t}.${c}<${b}`); return Promise.resolve(1); },
    expiredStories: (before, limit) => { calls.before = before; return Promise.resolve(left.slice(0, limit)); },
    removeFiles: (bucket, paths) => { calls.removed.push(...paths.map((p) => bucket + "/" + p)); return Promise.resolve(); },
    deleteStories: (ids) => { calls.storyIds.push(...ids); left = left.filter((s) => !ids.includes(s.id)); return Promise.resolve(); },
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}
const TOKEN = "a".repeat(64);
const post = (token: string | null = TOKEN) =>
  new Request("https://x.supabase.co/functions/v1/purge", { method: "POST", body: "{}", headers: token === null ? {} : { "x-cron-token": token } });

Deno.test("seule la tâche planifiée peut lancer le ménage : jeton absent, trop court ou faux → 401, rien n'est effacé", async () => {
  for (const token of [null, "", "court", "b".repeat(64), "a".repeat(500)]) {
    const { deps, calls } = fakeDeps();
    const res = await handle(post(token), deps);
    assertEquals([res.status, calls.deletes.length, calls.marked, calls.sessions.length], [401, 0, 0, 0], String(token).slice(0, 10));
  }
});
Deno.test("sessions de connexion : inutilisées depuis 30 jours ou ouvertes depuis 180 jours, fermées chaque nuit", async () => {
  const { deps, calls } = fakeDeps();
  const body = await (await handle(post(), deps)).json();
  assertEquals([calls.sessions, body.deleted.sessions], [[[SESSION_IDLE_DAYS, SESSION_MAX_DAYS]], 3]);
  assertEquals([SESSION_IDLE_DAYS, SESSION_MAX_DAYS], [30, 180]);
});
Deno.test("comptes jamais confirmés (code jamais saisi) : supprimés après 7 jours", async () => {
  const { deps, calls } = fakeDeps();
  const body = await (await handle(post(), deps)).json();
  assertEquals([calls.unconfirmed, body.deleted.unconfirmed_accounts, UNCONFIRMED_DAYS], [[7], 2, 7]);
});

Deno.test("efface chaque table selon sa durée de conservation", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handle(post(), deps);
  assertEquals(res.status, 200);
  assertEquals(calls.deletes, [
    "notifications.created_at<2026-08-25T03:17:00.000Z",
    "merchant_visitors.day<2026-07-26",
    "merchant_event_visitors.day<2026-07-26",
    "merchant_view_hours.day<2026-07-26",
    "story_viewers.viewed_at<2026-07-26T03:17:00.000Z",
    "promo_clicks.clicked_at<2026-07-26T03:17:00.000Z",
    "merchant_stats.day<2026-04-27",
    "visit_budget.day<2026-10-22",
    "signup_attempts.created_at<2026-10-22T03:17:00.000Z",
    "whop_events.received_at<2026-09-24T03:17:00.000Z",
    "site_events.day<2025-09-24",
  ]);
  assertEquals(calls.marked, 1);
  const body = await res.json();
  assertEquals(Object.keys(body.deleted).length, RULES.length + 3);
});
Deno.test("stories finies depuis plus de 30 jours : photos retirées du stockage, puis les stories", async () => {
  const { deps, calls } = fakeDeps({}, 250);
  const body = await (await handle(post(), deps)).json();
  assertEquals(calls.before, new Date(NOW.getTime() - STORY_KEEP_DAYS * 864e5).toISOString());
  assertEquals([body.deleted.stories, body.files, calls.storyIds.length, calls.removed.length], [250, 125, 250, 125]);
  assertEquals(calls.removed[0], "stories/m1/s0.jpg");
});
Deno.test("un seul passage par heure : un appel en trop ne fait rien", async () => {
  const { deps, calls } = fakeDeps({ lastRun: () => Promise.resolve(new Date(NOW.getTime() - 10 * 60 * 1000)) });
  assertEquals(await (await handle(post(), deps)).json(), { skipped: true });
  assertEquals([calls.deletes.length, calls.marked], [0, 0]);
  const later = fakeDeps({ lastRun: () => Promise.resolve(new Date(NOW.getTime() - 2 * 60 * 60 * 1000)) });
  await handle(post(), later.deps);
  assertEquals(later.calls.deletes.length, RULES.length);
});
Deno.test("méthode autre que POST refusée ; erreur de la base : 500 sans détail", async () => {
  const { deps } = fakeDeps();
  assertEquals((await handle(new Request("https://x/purge"), deps)).status, 405);
  const broken = fakeDeps({ deleteOlder: () => Promise.reject(new Error("panne")) });
  const res = await handle(post(), broken.deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "server");
});
