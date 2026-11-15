/**
 * Check for GET /api/tutor/context and lib/tutor/context.ts. No network: Supabase env is removed and fetch is stubbed.
 * Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/context.check.ts
 */
import assert from "node:assert/strict";
import { TutorContext, tutorContextFixture } from "@parrot/shared";
import type { TutorContextData } from "../../learner/queries";
import { buildTutorContext, loadTutorContext, pickTargetWords, shortSentence } from "../context";
import { getSession, resetSessions } from "../session";
import { UNITS } from "../../curriculum/units";

const NPR_TITLE = "Nvidia CEO Jensen Huang resigns amid spy scandal : NPR";
const at = "2026-11-14T12:00:00.000Z";
const now = new Date("2026-11-14T14:00:00.000Z"); // 2h after the hovers

// Mirrors scripts/seed-demo: NPR hovers newest-first (empresa = flip word), plus a cognate and an unlisted word.
const seeded: TutorContextData = {
  level: "intermediate",
  hoveredWords: [
    { lemma: "empresa", sentence: "…la empresa took the extraordinary step…", hoveredAt: at, articleTitle: NPR_TITLE, outcome: "didnt_know", article: "la", english: "company; business", cognate: false },
    { lemma: "investigación", sentence: "…launching an investigation…", hoveredAt: at, article: "la", english: "investigation", cognate: true },
    { lemma: "mercado", sentence: "…it dominates el mercado for GPUs.", hoveredAt: at, outcome: "knew_it", article: "el", english: "market", cognate: false },
    { lemma: "chisme", hoveredAt: at, article: null, english: "", cognate: false },
    { lemma: "mundo", sentence: "…most valuable in el mundo…", hoveredAt: at, article: "el", english: "world", cognate: false },
    { lemma: "negocio", sentence: "…negocio…", hoveredAt: at, article: "el", english: "business; deal", cognate: false },
  ],
  dueWords: [
    { lemma: "mercado", dueAt: at, article: "el", english: "market", cognate: false },
    { lemma: "casa", dueAt: at, article: "la", english: "house; home", cognate: false },
    { lemma: "aprovechar", dueAt: "2026-11-11T12:00:00.000Z", article: null, english: " to make the most of ; to take advantage of", cognate: false },
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

  // 1b. lesson branch (D-022). Returning demo (int-1 holds the NPR hovers): unchanged, no article catch-up slots.
  const lessonOf = (id: string): NonNullable<TutorContextData["lesson"]> => {
    const unit = UNITS.find((u) => u.id === id)!;
    return {
      unit,
      position: "check",
      words: unit.words.map((lemma) => ({ lemma, article: null, english: `${lemma} (en)`, cognate: false, state: "new" as const })),
      lastLesson: null,
    };
  };
  assert.deepEqual(
    pickTargetWords({ ...seeded, lesson: lessonOf("int-1") }).map((t) => [t.lemma, t.source]),
    [["empresa", "hovered"], ["mercado", "hovered"], ["mundo", "hovered"], ["negocio", "lesson"], ["problema", "lesson"]],
  );
  // New demo (beg-0 shares no word with the article): 2 article words first, "Didn't know" before "looked",
  // "Knew it" skipped, a "Didn't know" cognate allowed; then the unit.
  const newDemo: TutorContextData = {
    ...seeded,
    level: "beginner",
    hoveredWords: [
      { lemma: "mundo", hoveredAt: at, article: "el", english: "world", cognate: false, outcome: "looked" },
      { lemma: "mercado", hoveredAt: at, article: "el", english: "market", cognate: false, outcome: "knew_it" },
      { lemma: "investigación", hoveredAt: at, article: "la", english: "investigation", cognate: true, outcome: "didnt_know" },
      { lemma: "empresa", hoveredAt: at, articleTitle: NPR_TITLE, article: "la", english: "company", cognate: false, outcome: "didnt_know" },
    ],
    lesson: lessonOf("beg-0"),
  };
  assert.deepEqual(
    pickTargetWords(newDemo).map((t) => [t.lemma, t.source]),
    [["investigación", "hovered"], ["empresa", "hovered"], ["ser", "lesson"], ["nombre", "lesson"], ["vivir", "lesson"]],
  );
  const newCtx = buildTutorContext(newDemo, "sess_new", now);
  assert.ok(newCtx.plan!.words[1]!.reason.includes(`you clicked "Didn't know"`), newCtx.plan!.words[1]!.reason);

  const ctx = buildTutorContext(seeded, "sess_check", now);
  TutorContext.parse(ctx);
  assert.deepEqual(ctx.articleTitles, [NPR_TITLE]);
  assert.deepEqual(ctx.dueWords, ["mercado", "casa", "aprovechar", "perro"]);
  assert.equal(ctx.hoveredWords.length, 6);
  assert.deepEqual(ctx.hoveredWords[3], { lemma: "chisme" }, "undefined sentence is omitted");
  assert.deepEqual(ctx.targetWords, targets);

  // 1a. J2 plan: newest article, one reason per target (same order), first recurring error
  assert.deepEqual(ctx.plan, {
    article: { title: NPR_TITLE, why: "You read it today and hovered 1 word in it" },
    words: [
      { lemma: "empresa", english: "company", reason: 'Hovered 2h ago (you clicked "Didn\'t know") in: "…la empresa took the extraordinary step…"' },
      { lemma: "mercado", english: "market", reason: 'Hovered 2h ago (you clicked "Knew it") in: "…it dominates el mercado for GPUs."' },
      { lemma: "mundo", english: "world", reason: 'Hovered 2h ago in: "…most valuable in el mundo…"' },
      { lemma: "casa", english: "house", reason: "Due for review" },
      { lemma: "aprovechar", english: "to make the most of", reason: "Due for review (3 days overdue)" },
    ],
    watchError: "la problema → el problema (agreement, 3× last session)",
  });

  // newest article with hovers beats a newer article without any; none with hovers → the newest
  const twoArticles = buildTutorContext({ ...seeded, articleTitles: ["Inflation - Wikipedia", NPR_TITLE] }, "sess_two", now);
  assert.equal(twoArticles.plan?.article?.title, NPR_TITLE);
  const noHoverArticle = buildTutorContext({ ...seeded, articleTitles: ["Inflation - Wikipedia", "Other"] }, "sess_two_b", now);
  assert.deepEqual(noHoverArticle.plan?.article, { title: "Inflation - Wikipedia", why: "You read it today" });

  // 1a'. sparse / odd data: blank title, no errors, unparseable times, title-only hover → still a plan
  const sparse = buildTutorContext(
    {
      ...seeded,
      articleTitles: ["   "],
      topErrors: [],
      hoveredWords: [
        { lemma: "empresa", hoveredAt: "garbage", article: "la", english: "company", cognate: false },
        { lemma: "mercado", hoveredAt: "garbage", articleTitle: NPR_TITLE, article: "el", english: "market", cognate: false },
        { lemma: "mundo", hoveredAt: "2026-11-14T13:55:00.000Z", article: "el", english: "world", cognate: false },
        { lemma: "negocio", hoveredAt: "2026-11-14T13:59:30.000Z", article: "el", english: "business", cognate: false },
      ],
      dueWords: [{ lemma: "casa", dueAt: "garbage", article: "la", english: "house", cognate: false }],
    },
    "sess_sparse",
    now,
  );
  assert.deepEqual(sparse.plan, {
    article: null,
    words: [
      { lemma: "empresa", english: "company", reason: "Hovered while reading" },
      { lemma: "mercado", english: "market", reason: `Hovered while reading in "${NPR_TITLE}"` },
      { lemma: "mundo", english: "world", reason: "Hovered 5m ago" },
      { lemma: "casa", english: "house", reason: "Due for review" },
    ],
    watchError: null,
  });
  const empty = buildTutorContext({ level: "beginner", hoveredWords: [], dueWords: [], articleTitles: [], topErrors: [] }, "sess_empty", now);
  assert.deepEqual(empty.plan, { article: null, words: [], watchError: null });
  // an error string in another format passes through as is
  const otherErr = buildTutorContext({ ...seeded, topErrors: ["agreement: la problema → el problema"] }, "sess_err", now);
  assert.equal(otherErr.plan?.watchError, "agreement: la problema → el problema");

  // 1a''. building the plan throws → context without plan (no crash), and the loader still reports db
  const boom = { ...seeded.hoveredWords[0]! };
  Object.defineProperty(boom, "articleTitle", {
    enumerable: true,
    get: () => {
      throw new Error("boom");
    },
  });
  const throwing: TutorContextData = { ...seeded, hoveredWords: [boom, ...seeded.hoveredWords.slice(1)] };
  const noPlan = buildTutorContext(throwing, "sess_boom", now);
  assert.equal("plan" in noPlan, false, "plan omitted when building it throws");
  assert.deepEqual(noPlan.targetWords, targets);
  const noPlanLoaded = await loadTutorContext(async () => throwing, 1000);
  assert.equal(noPlanLoaded.source, "db");
  assert.equal(noPlanLoaded.context.plan, undefined);

  // 1a'''. hover sentences are cut to ~60 chars around the word, at word boundaries
  const long = "The government said on Tuesday that la empresa would have to pay a record fine after the long investigation ended.";
  const cut = shortSentence(long, "empresa");
  assert.ok(cut.length <= 62 && cut.startsWith("…") && cut.endsWith("…") && cut.includes("la empresa"), cut);
  const head = shortSentence(long, "nada");
  assert.ok(head.startsWith("The government") && head.endsWith("…") && head.length <= 61, head);
  const stem = shortSentence("Commuters on the long walk home said they aprovechan the quiet streets while the strike goes on", "aprovechar");
  assert.ok(stem.includes("aprovechan") && stem.length <= 62, stem);
  assert.equal(shortSentence("  short   one ", "x"), "short one");

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
  assert.ok(tutorContextFixture.plan, "fixture has a plan");
  assert.equal(a.context.plan, undefined, "fixture fallback shows no lesson card (its reasons never happened)");
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
  assert.equal(body.plan, undefined);
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
  console.log(`ok (targets ${targets.map((t) => t.lemma).join(",")}, plan reasons ${ctx.plan?.words.length}, timeout fallback ${slowMs}ms, route ${routeMs}ms, fetch calls ${fetchCalls})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
