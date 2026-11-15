// Demo seed (architecture §7, brief 3.6): backdated FSRS history so "due" and "mastered" exist during the demo,
// plus the demo article, its hovers (with sentences), one past tutor session with a recap, and settings.
// Idempotent: wipes ALL of DEMO_USER_ID's words, events, articles and tutor sessions before writing (full demo reset).
// Hover timestamps are relative to now (getTutorContextData uses a 24h window): reseed right before judging.
//   cd scripts && npm run seed-demo            (needs web/.env.local + seeded `words`)
//   cd scripts && npm run seed-demo -- --dry   (print the plan, no DB writes)
import "../build-wordlist/lib.ts"; // loads web/.env.local
import { createHash } from "node:crypto";
import { Recap, settingsFixture } from "@parrot/shared";
import { applyEvent, isDue } from "../../web/lib/learner/applyEvent.ts";
import { emptyUserWord, type LearnerEventType, type UserWord } from "../../web/lib/learner/types.ts";

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const dry = process.argv.includes("--dry");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const userId = process.env.DEMO_USER_ID;
if (!dry && (!url || !key || !userId)) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY / DEMO_USER_ID missing (web/.env.local)");

const headers: Record<string, string> = { apikey: key ?? "", "Content-Type": "application/json" };
if (key?.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`; // legacy JWT service keys only

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---- Demo content (agreed with Naren and Andrew) ----

/** articleKey recipe proposed to Naren: sha256 hex of `${hostname}\n${document.title}`. Must match the extension. */
const articleKey = (domain: string, title: string) => createHash("sha256").update(`${domain}\n${title}`).digest("hex");

// Naren: NPR demo article. Title is document.title verbatim (with the " : NPR" suffix).
const NPR = { domain: "www.npr.org", title: "Nvidia CEO Jensen Huang resigns amid spy scandal : NPR" };
// Naren: real swaps on that page, with the post-swap sentences the learner actually reads.
// Oldest → newest. Andrew's context route targets the 3 newest hovers, so the flip word must be last.
const NPR_HOVERS: { lemma: string; sentence: string; minutesAgo: number }[] = [
  {
    lemma: "negocio",
    sentence:
      "But analysts say despite Huang's visionary management of el negocio, he had a blind spot for succession and hadn't articulated a clear plan, at least publicly.",
    minutesAgo: 120,
  },
  {
    lemma: "mundo",
    sentence: "Today, it's valued at more than $4 trillion, among the most valuable in el mundo, and it dominates el mercado for GPUs.",
    minutesAgo: 90,
  },
  {
    lemma: "mercado",
    sentence: "Today, it's valued at more than $4 trillion, among the most valuable in el mundo, and it dominates el mercado for GPUs.",
    minutesAgo: 60,
  },
  {
    lemma: "empresa",
    sentence:
      "The decision comes days after la empresa took the extraordinary step of launching an investigation following news reports alleging that Huang had had an extramarital affair with one of the company's clients…",
    minutesAgo: 15,
  },
];

// Andrew (team chat): the stage word that flips to known live. Stays `learning`, newest seeded hover.
const FLIP_LEMMA = "empresa";

// Articles earlier seed versions wrote. Deleted on every run so the tutor opener can only pick the NPR article.
const LEGACY_ARTICLES = [{ domain: "www.bbc.com", title: "Workers strike as talks stall - BBC News" }];

// Pinned recipes: problema is in the past session's agreement error, so it must exist as a real word.
const PINNED: Record<string, keyof typeof recipes> = { problema: "known" };

// Fixed ids so reruns replace seed rows instead of piling up (v4-shaped so they pass uuid checks).
const seedId = (n: number) => `5eed0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SESSION_ID = seedId(900);

// ---- Learner history ----

const now = new Date();
let n = 0;
const ev = (w: UserWord, type: LearnerEventType, at: Date) =>
  applyEvent(w, { id: `seed-${n++}`, type, lemma: w.lemma, articleKey: "seed", ts: at.getTime() }, at);
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

// Review at every due date from `start` until the next due date is in the future (i.e. caught up today).
function reviewUntilCaughtUp(w: UserWord, type: LearnerEventType, start: Date): UserWord {
  let t = start;
  for (let guard = 0; t <= now && guard < 50; guard++) {
    w = ev(w, type, t);
    t = new Date(w.dueAt!);
  }
  return w;
}

// Each recipe produces one target state from a plausible backdated history.
const recipes = {
  // Used correctly in speech at every due date for ~6 months → stability ≥ 60d, not due.
  mastered: (lemma: string) => reviewUntilCaughtUp(ev(emptyUserWord(lemma), "hover", daysAgo(200)), "spoken_correct", daysAgo(199)),
  // Hovered + self-reported 2 weeks ago, never reviewed since → overdue (top swap priority).
  due: (lemma: string) => ev(ev(emptyUserWord(lemma), "hover", daysAgo(14)), "knew_it", daysAgo(13.99)),
  // Passed quizzes on schedule over the last ~10 days → "Your vocabulary", not due yet.
  known: (lemma: string) => reviewUntilCaughtUp(ev(emptyUserWord(lemma), "hover", daysAgo(10)), "quiz_pass", daysAgo(9.99)),
  // Hovered 3 days ago, then self-reported at each due date → still `learning` (knew_it never changes state), not due.
  learning: (lemma: string) => reviewUntilCaughtUp(ev(emptyUserWord(lemma), "hover", daysAgo(3)), "knew_it", daysAgo(2.99)),
} satisfies Record<string, (lemma: string) => UserWord>;
const PLAN: [keyof typeof recipes, number][] = [["mastered", 4], ["due", 6], ["known", 4], ["learning", 5]];

// Demo hovers: NPR words over the last ~2h, flip word newest (all inside the 24h window).
type Hover = { lemma: string; sentence: string; article: { domain: string; title: string }; at: Date };
const hovers: Hover[] = NPR_HOVERS.map((h) => ({ lemma: h.lemma, sentence: h.sentence, article: NPR, at: new Date(now.getTime() - h.minutesAgo * MIN) }));
const articles = [NPR];
const newest = [...hovers].sort((a, b) => b.at.getTime() - a.at.getTime())[0];
if (newest?.lemma !== FLIP_LEMMA) throw new Error(`${FLIP_LEMMA} must be the newest seeded hover (it's ${newest?.lemma})`);

const fixed = new Set([...hovers.map((h) => h.lemma), ...Object.keys(PINNED)]);
const total = PLAN.reduce((s, [, k]) => s + k, 0);
// Common nouns, skipping the very top ranks (too basic to be interesting on stage) and the fixed lemmas.
const picked: string[] = dry
  ? Array.from({ length: total }, (_, i) => `word${i}`)
  : ((await rest(`words?select=lemma&pos=eq.noun&band=eq.1&order=rank.asc&offset=20&limit=${total + fixed.size}`)) as { lemma: string }[])
      .map((r) => r.lemma)
      .filter((l) => !fixed.has(l))
      .slice(0, total);
if (picked.length < total) throw new Error(`need ${total} band-1 nouns in words, found ${picked.length}: seed the word list first`);

const rows: UserWord[] = [];
let i = 0;
for (const [recipe, count] of PLAN) for (let j = 0; j < count; j++) rows.push(recipes[recipe](picked[i++]));
for (const [lemma, recipe] of Object.entries(PINNED)) rows.push(recipes[recipe](lemma));
// Hovered words: user_words comes from the same hover events we store, so lastHoverAt matches events.ts.
for (const h of hovers) rows.push(ev(emptyUserWord(h.lemma), "hover", h.at));

const counts: Record<string, number> = {};
for (const w of rows) {
  const label = isDue(w, now) ? `${w.state} (due)` : w.state;
  counts[label] = (counts[label] ?? 0) + 1;
}
console.log("seed-demo plan:", counts, "| hovers:", hovers.map((h) => h.lemma).join(", "), "| flip:", FLIP_LEMMA);
const missing = ["mastered", "known", "learning", "learning (due)"].filter((k) => !counts[k]);
if (missing.length) throw new Error(`recipe drift, missing states: ${missing.join(", ")}`);
if (rows.find((w) => w.lemma === FLIP_LEMMA)?.state !== "learning") throw new Error(`${FLIP_LEMMA} must be learning`);

// Past tutor session (yesterday) whose recap gives the lesson card's "Watching for" line a real error.
const recap = Recap.parse({
  topErrors: [
    {
      type: "agreement",
      span: "la problema",
      correction: "el problema",
      explanation_en: "Problema is masculine even though it ends in -a: el problema.",
      count: 3,
    },
  ],
  wordsNowKnown: ["problema"],
  reviewTomorrow: ["empresa", "mercado"],
  summary_en: "You talked about your week and your job. Watch the article with problema: it's el problema.",
  tips: ['Words ending in -ma from Greek are often masculine: "el problema", "el sistema", "el tema".'],
  // D-022: the course memory the tutor opens with ("last time"). Checkpoint not passed: the el/la mistake.
  lesson: {
    unitId: "int-1",
    checkpointPassed: false,
    summary_en: "Started talking about work; mixed up el/la with problema.",
    nextStep_en: "Use empresa and mercado in sentences; say el problema.",
  },
});

if (dry) process.exit(0);

// ---- Writes ----

// Full reset of the demo user: everyone's test hovers, clicks, articles and tutor sessions go too, so leftovers
// never show up in Luci's lesson plan on stage. Settings are rewritten below. (Utterances cascade with sessions.)
for (const table of ["events", "articles", "tutor_sessions", "user_words"]) {
  await rest(`${table}?user_id=eq.${userId}`, { method: "DELETE" });
}
await rest("user_words", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify(
    rows.map((w) => ({
      user_id: userId,
      lemma: w.lemma,
      state: w.state,
      fsrs_card: w.fsrsCard,
      seen_count: w.seenCount,
      seen_articles: w.seenArticles,
      last_hover_at: w.lastHoverAt,
      due_at: w.dueAt,
    })),
  ),
});
console.log(`seed-demo: wrote ${rows.length} user_words`);

// Articles (one row per article_key) + a reading event each, then the hover events.
// Delete seed-owned and legacy article rows first: upsert alone would leave old articles behind.
const ownedKeys = [...articles, ...LEGACY_ARTICLES].map((a) => articleKey(a.domain, a.title));
await rest(`articles?user_id=eq.${userId}&article_key=in.(${ownedKeys.join(",")})`, { method: "DELETE" });
await rest("articles?on_conflict=user_id,article_key", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(
    articles.map((a, k) => ({
      user_id: userId,
      article_key: articleKey(a.domain, a.title),
      title: a.title,
      domain: a.domain,
      ts: new Date(now.getTime() - (150 - k * 10) * MIN).toISOString(),
    })),
  ),
});
const events = [
  ...articles.map((a, k) => ({
    id: seedId(100 + k),
    user_id: userId,
    type: "reading",
    lemma: null,
    article_key: articleKey(a.domain, a.title),
    ts: new Date(now.getTime() - (150 - k * 10) * MIN).toISOString(),
    meta: { title: a.title, domain: a.domain },
  })),
  ...hovers.map((h, k) => ({
    id: seedId(200 + k),
    user_id: userId,
    type: "hover",
    lemma: h.lemma,
    article_key: articleKey(h.article.domain, h.article.title),
    ts: h.at.toISOString(),
    meta: { sentence: h.sentence },
  })),
];
await rest("events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(events) });
console.log(`seed-demo: wrote ${articles.length} articles, ${events.length} events`);

// Past session (all of the user's sessions were cleared above).
await rest("tutor_sessions", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    id: SESSION_ID,
    user_id: userId,
    started_at: daysAgo(1).toISOString(),
    ended_at: new Date(daysAgo(1).getTime() + 6 * MIN).toISOString(),
    recap,
  }),
});
console.log("seed-demo: wrote 1 past tutor session with recap");

// Settings row for the demo user (brief 0.1), reset to the fixture values on every run.
await rest("settings?on_conflict=user_id", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ user_id: userId, data: settingsFixture }),
});
console.log("seed-demo: wrote settings");
