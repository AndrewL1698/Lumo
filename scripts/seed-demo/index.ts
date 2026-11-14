// Demo seed (architecture §7): backdated FSRS history so "due" and "mastered" exist during the demo.
// Neither can happen naturally in one weekend. Idempotent: wipes DEMO_USER_ID's user_words first.
//   cd scripts && npm run seed-demo            (needs web/.env.local + seeded `words`)
//   cd scripts && npm run seed-demo -- --dry   (print the plan, no DB writes)
import "../build-wordlist/lib.ts"; // loads web/.env.local
import { applyEvent, isDue } from "../../web/lib/learner/applyEvent.ts";
import { emptyUserWord, type EventType, type UserWord } from "../../web/lib/learner/types.ts";

const DAY = 24 * 60 * 60 * 1000;
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
  return res.status === 204 ? null : res.json();
}

const now = new Date();
let n = 0;
const ev = (w: UserWord, type: EventType, at: Date) =>
  applyEvent(w, { id: `seed-${n++}`, type, lemma: w.lemma, articleKey: "seed", ts: at.toISOString() }, at);
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

// Review at every due date from `start` until the next due date is in the future (i.e. caught up today).
function reviewUntilCaughtUp(w: UserWord, type: EventType, start: Date): UserWord {
  let t = start;
  for (let guard = 0; t <= now && guard < 50; guard++) {
    w = ev(w, type, t);
    t = new Date(w.dueAt!);
  }
  return w;
}

// Each recipe produces one target state from a plausible backdated history.
const recipes: Record<string, (lemma: string) => UserWord> = {
  // Used correctly in speech at every due date for ~6 months → stability ≥ 60d, not due.
  mastered: (lemma) => reviewUntilCaughtUp(ev(emptyUserWord(lemma), "hover", daysAgo(200)), "speech_correct", daysAgo(199)),
  // Hovered + self-reported 2 weeks ago, never reviewed since → overdue (top swap priority).
  due: (lemma) => ev(ev(emptyUserWord(lemma), "hover", daysAgo(14)), "knew_it", daysAgo(13.99)),
  // Passed quizzes on schedule over the last ~10 days → "Your vocabulary", not due yet.
  known: (lemma) => reviewUntilCaughtUp(ev(emptyUserWord(lemma), "hover", daysAgo(10)), "quiz_pass", daysAgo(9.99)),
  // Hovered just now → "Learning now" (short FSRS step, so it may show as due within minutes).
  learning: (lemma) => ev(emptyUserWord(lemma), "hover", now),
};
const PLAN: [keyof typeof recipes, number][] = [["mastered", 4], ["due", 6], ["known", 5], ["learning", 5]];

const total = PLAN.reduce((s, [, k]) => s + k, 0);
// Common nouns, skipping the very top ranks (too basic to be interesting on stage).
const lemmas: string[] = dry
  ? Array.from({ length: total }, (_, i) => `word${i}`)
  : ((await rest(`words?select=lemma&pos=eq.noun&band=eq.1&order=rank.asc&offset=20&limit=${total}`)) as { lemma: string }[]).map((r) => r.lemma);
if (lemmas.length < total) throw new Error(`need ${total} band-1 nouns in words, found ${lemmas.length}: seed the word list first`);

const rows: UserWord[] = [];
let i = 0;
for (const [recipe, count] of PLAN) for (let j = 0; j < count; j++) rows.push(recipes[recipe](lemmas[i++]));

const counts: Record<string, number> = {};
for (const w of rows) {
  const label = isDue(w, now) ? `${w.state} (due)` : w.state;
  counts[label] = (counts[label] ?? 0) + 1;
}
console.log("seed-demo plan:", counts);
const missing = ["mastered", "known", "learning (due)"].filter((k) => !counts[k]);
if (!counts["learning"] && !counts["learning (due)"]) missing.push("learning");
if (missing.length) throw new Error(`recipe drift, missing states: ${missing.join(", ")}`);

if (dry) process.exit(0);

await rest(`user_words?user_id=eq.${userId}`, { method: "DELETE" });
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
console.log(`seed-demo: wrote ${rows.length} user_words for ${userId}`);
