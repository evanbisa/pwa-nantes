// Tests de la fonction purge, sans réseau : deno test supabase/functions/
import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle, RULES, STORY_KEEP_DAYS } from "./handler.ts";

const NOW = new Date("2026-10-24T03:17:00Z");
function fakeDeps(over: Partial<Deps> = {}, stories = 0) {
  const calls = { deletes: [] as string[], removed: [] as string[], storyIds: [] as string[], marked: 0, before: "" };
  let left = Array.from({ length: stories }, (_, i) => ({ id: "s" + i, image_path: i % 2 ? null : "m1/s" + i + ".jpg" }));
  const deps: Deps = {
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
const post = () => new Request("https://x.supabase.co/functions/v1/purge", { method: "POST", body: "{}" });

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
  ]);
  assertEquals(calls.marked, 1);
  const body = await res.json();
  assertEquals(Object.keys(body.deleted).length, RULES.length + 1);
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
