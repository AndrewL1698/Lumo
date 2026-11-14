/**
 * Check for GET /api/tutor/context and lib/tutor/context.ts. No network: Supabase env is removed and fetch is stubbed.
 * Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/context.check.ts
 */
import assert from "node:assert/strict";
import { TutorContext, tutorContextFixture } from "@parrot/shared";
import type { TutorContextData } from "../../learner/queries";
import { buildTutorContext, loadTutorContext, pickTargetWords } from "../context";
import { getSession, resetSessions } from "../session";

const NPR_TITLE = "Nvidia CEO Jensen Huang resigns amid spy scandal : NPR";
const at = "2026-11-14T12:00:00.000Z";

// Mirrors scripts/seed-demo: NPR hovers newest-first (empresa = flip word), plus a cognate and an unlisted word.
const seeded: TutorContextData = {
  level: "intermediate",
  hoveredWords: [
    { lemma: "empresa", sentence: "…la empresa took the extraordinary step…", hoveredAt: at, articleTitle: NPR_TITLE, article: "la", english: "company; business", cognate: false },
    { lemma: "investigación", sentence: "…launching an investigation…", hoveredAt: at, article: "la", english: "investigation", cognate: true },
    { lemma: "mercado", sentence: "…it dominates el mercado for GPUs.", hoveredAt: at, article: "el", english: "market", cognate: false },
    { lemma: "chisme", hoveredAt: at, article: null, english: "", cognate: false },
    { lemma: "mundo", sentence: "…most valuable in el mundo…", hoveredAt: at, article: "el", english: "world", cognate: false },
    { lemma: "negocio", sentence: "…negocio…", hoveredAt: at, article: "el", english: "business; deal", cognate: false },
  ],
  dueWords: [
    { lemma: "mercado", dueAt: at, article: "el", english: "market", cognate: false },
    { lemma: "casa", dueAt: at, article: "la", english: "house; home", cognate: false },
    { lemma: "aprovechar", dueAt: at, article: null, english: " to make the most of ; to take advantage of", cognate: false },
    { lemma: "perro", dueAt: at, article: "el", english: "dog", cognate: false },
  ],
  articleTitles: [NPR_TITLE],
  topErrors: ['agreement: "la problema" → "el problema" (3×)'],
};

async function main() {
  // Safety net: nothing in this check may reach the network.
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("network is disabled in context.check.ts"));
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.TUTOR_MOCK;
  resetSessions();

  // 1. seeded-shaped data → 3 newest hovered + 2 most-overdue due, skipping cognate / unlisted / duplicate
  const targets = pickTargetWords(seeded);
  assert.ok(targets.length <= 5);
  assert.deepEqual(
    targets.map((t) => [t.lemma, t.source]),
    [["empresa", "hovered"], ["mercado", "hovered"], ["mundo", "hovered"], ["casa", "due"], ["aprovechar", "due"]],
  );
  assert.deepEqual(targets[0], { lemma: "empresa", article: "la", english: "company", source: "hovered" });
  assert.equal(targets[3]!.english, "house");
  assert.equal(targets[4]!.english, "to make the most of");
  assert.equal("article" in targets[4]!, false, "null article is omitted");
  const ctx = buildTutorContext(seeded, "sess_check");
  TutorContext.parse(ctx);
  assert.deepEqual(ctx.articleTitles, [NPR_TITLE]);
  assert.deepEqual(ctx.dueWords, ["mercado", "casa", "aprovechar", "perro"]);
  assert.equal(ctx.hoveredWords.length, 6);
  assert.deepEqual(ctx.hoveredWords[3], { lemma: "chisme" }, "undefined sentence is omitted");
  assert.deepEqual(ctx.targetWords, targets);

  // 1b. loader success → source db
  const ok = await loadTutorContext(async () => seeded, 1000);
  assert.equal(ok.source, "db");
  assert.equal(ok.reason, undefined);
  assert.deepEqual(ok.context.articleTitles, [NPR_TITLE]);

  // 2. throwing loader → fixture with a fresh sessionId each time
  const a = await loadTutorContext(async () => {
    throw new Error("db down");
  }, 1000);
  const b = await loadTutorContext(() => {
    throw new Error("sync throw");
  }, 1000);
  assert.equal(a.source, "fixture");
  assert.equal(a.reason, "db down");
  assert.equal(b.source, "fixture");
  assert.deepEqual(a.context.articleTitles, tutorContextFixture.articleTitles);
  assert.notEqual(a.context.sessionId, "sess_demo_1");
  assert.notEqual(a.context.sessionId, b.context.sessionId);

  // 2b. bad data (parse failure) → fixture
  const bad = await loadTutorContext(async () => ({ ...seeded, level: "expert" }) as unknown as TutorContextData, 1000);
  assert.equal(bad.source, "fixture");

  // 3. loader that never resolves → fixture after the timeout
  let t0 = Date.now();
  const slow = await loadTutorContext(() => new Promise<TutorContextData>(() => {}), 50);
  const slowMs = Date.now() - t0;
  assert.equal(slow.source, "fixture");
  assert.match(slow.reason ?? "", /timed out/);
  assert.ok(slowMs < 1000, `timeout fallback took ${slowMs}ms`);

  // 3b. late rejection from the losing loader must not crash the process
  await loadTutorContext(() => new Promise<TutorContextData>((_, rej) => setTimeout(() => rej(new Error("late")), 80)), 20);
  await new Promise((r) => setTimeout(r, 120));

  // 4. route with the DB off → fixture, stored as the session's context
  const { GET } = await import("../../../app/api/tutor/context/route");
  t0 = Date.now();
  let res = await GET();
  const routeMs = Date.now() - t0;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Context-Source"), "fixture");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  let body = TutorContext.parse(await res.json());
  assert.notEqual(body.sessionId, "sess_demo_1");
  assert.deepEqual(body.articleTitles, tutorContextFixture.articleTitles);
  assert.deepEqual(getSession(body.sessionId).context, body);
  assert.deepEqual(getSession(body.sessionId).policy.targetLemmas, body.targetWords.map((w) => w.lemma));
  const firstId = body.sessionId;

  // 5. TUTOR_MOCK=1 → fixture with a fresh id
  process.env.TUTOR_MOCK = "1";
  res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Context-Source"), "fixture");
  body = TutorContext.parse(await res.json());
  assert.notEqual(body.sessionId, "sess_demo_1");
  assert.notEqual(body.sessionId, firstId);
  assert.deepEqual(getSession(body.sessionId).context, body);
  delete process.env.TUTOR_MOCK;

  assert.equal(fetchCalls, 0, "fetch must never be called");
  console.log(`ok (targets ${targets.map((t) => t.lemma).join(",")}, timeout fallback ${slowMs}ms, route ${routeMs}ms, fetch calls ${fetchCalls})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
