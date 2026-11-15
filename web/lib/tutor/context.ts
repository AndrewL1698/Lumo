/**
 * Tutor session context (task 10): turns Karthik's TutorContextData into the shared TutorContext.
 * Pure except randomUUID; no db/learner imports (only the type) so checks run offline.
 */
import { randomUUID } from "node:crypto";
import { TutorContext, TutorPlan, tutorContextFixture } from "@parrot/shared";
import type { TargetWord } from "@parrot/shared";
import type { TutorContextData } from "../learner/queries";

const MAX_HOVERED_TARGETS = 3;
const MAX_LESSON_HOVERED = 3; // hovered words that belong to today's unit
const MAX_LESSON_DUE = 1;
const MAX_DUE_TARGETS = 2;
const MAX_TARGETS = 5;
const MAX_READING = 2; // article words outside today's unit: the lesson's catch-up half

type WordLike = { lemma: string; article: string | null; english: string; cognate: boolean };

/** Up to 3 newest hovered words, then up to 2 most-overdue due words. Skips cognates, unlisted words, duplicates. */
export function pickTargetWords(data: TutorContextData): TargetWord[] {
  const out: TargetWord[] = [];
  const seen = new Set<string>();
  const lesson = data.lesson ?? null;
  const take = (words: WordLike[], source: TargetWord["source"], max: number) => {
    let n = 0;
    for (const w of words) {
      if (n >= max || out.length >= MAX_TARGETS) break;
      const key = w.lemma.toLowerCase();
      if (w.cognate || seen.has(key)) continue;
      const english = (w.english ?? "").split(";")[0]?.trim() ?? "";
      if (!english) continue; // not in the word list: can never flip
      const t: TargetWord = { lemma: w.lemma, english, source };
      if (typeof w.article === "string" && w.article.trim()) t.article = w.article;
      out.push(t);
      seen.add(key);
      n += 1;
    }
  };
  if (lesson) {
    // D-022: unit words the learner hovered, then unit due. Then up to 2 article words from outside the unit
    // ("Didn't know" first, "Knew it" skipped): the lesson's first half catches up on them (prompts.ts CATCH_UP_RULES).
    // Then the rest of the unit that isn't known yet; then at most one outside hover, then outside due words.
    const inUnit = new Set(lesson.unit.words);
    const solid = new Set(lesson.words.filter((w) => w.state === "known" || w.state === "mastered").map((w) => w.lemma));
    take(data.hoveredWords.filter((w) => inUnit.has(w.lemma)), "hovered", MAX_LESSON_HOVERED);
    const room = Math.min(MAX_READING, MAX_LESSON_HOVERED - out.length); // 0 when the unit already has 3 hovers
    take(data.dueWords.filter((w) => inUnit.has(w.lemma)), "due", MAX_LESSON_DUE);
    const rank = (w: { outcome?: string }) => (w.outcome === "didnt_know" ? 0 : 1);
    const reading = data.hoveredWords
      .filter((w) => !inUnit.has(w.lemma) && w.outcome !== "knew_it")
      .sort((a, b) => rank(a) - rank(b)) // stable: newest first inside each group
      .map((w) => ({ ...w, cognate: w.cognate && w.outcome !== "didnt_know" })); // they said they didn't know it
    take(reading, "hovered", room);
    take(lesson.words.filter((w) => !solid.has(w.lemma)), "lesson", MAX_TARGETS);
    take(data.hoveredWords.filter((w) => !inUnit.has(w.lemma)), "hovered", 1);
    take(data.dueWords.filter((w) => !inUnit.has(w.lemma)), "due", MAX_DUE_TARGETS);
    return out;
  }
  take(data.hoveredWords, "hovered", MAX_HOVERED_TARGETS);
  take(data.dueWords, "due", MAX_DUE_TARGETS);
  return out;
}

export function buildTutorContext(data: TutorContextData, sessionId: string, now: Date = new Date()): TutorContext {
  const context = TutorContext.parse({
    sessionId,
    hoveredWords: data.hoveredWords.map((h) => (h.sentence === undefined ? { lemma: h.lemma } : { lemma: h.lemma, sentence: h.sentence })),
    dueWords: data.dueWords.map((d) => d.lemma),
    articleTitles: data.articleTitles,
    level: data.level,
    topErrors: data.topErrors,
    targetWords: pickTargetWords(data),
    ...(data.lesson && {
      lesson: {
        unitId: data.lesson.unit.id,
        title: data.lesson.unit.title,
        canDo: data.lesson.unit.canDo,
        concept: data.lesson.unit.concept.name,
        teach: data.lesson.unit.concept.teach,
        position: data.lesson.position,
        prompts: data.lesson.unit.prompts,
        ...(data.lesson.lastLesson && {
          lastTime: data.lesson.lastLesson.summary_en,
          nextStep: data.lesson.lastLesson.nextStep_en,
        }),
      },
    }),
  });
  // J2 lesson card is optional: any problem building it just leaves `plan` off.
  try {
    const plan = TutorPlan.safeParse(buildPlan(data, context.targetWords, now));
    if (plan.success) {
      context.plan = plan.data;
      // The card names one article; list it first so the opener ("mention the first article") talks about the same one.
      const title = plan.data.article?.title;
      if (title) context.articleTitles = [title, ...context.articleTitles.filter((t) => t !== title)];
    }
  } catch {
    // no plan
  }
  return context;
}

// ---------- J2 "Today's lesson" plan: reasons from data we already hold, no model call ----------

/** Article = newest of today's titles the learner hovered words in (else the newest); each target's reason from its hover/due row; first recurring error. */
export function buildPlan(data: TutorContextData, targets: TargetWord[], now: Date): TutorPlan {
  const title = data.articleTitles.find((t) => data.hoveredWords.some((h) => h.articleTitle === t)) ?? data.articleTitles[0];
  let article: TutorPlan["article"] = null;
  if (typeof title === "string" && title.trim()) {
    const n = data.hoveredWords.filter((h) => h.articleTitle === title).length;
    article = { title, why: n ? `You read it today and hovered ${n} word${n === 1 ? "" : "s"} in it` : "You read it today" };
  }

  const find = <T extends { lemma: string }>(rows: T[], lemma: string) => rows.find((r) => r.lemma.toLowerCase() === lemma.toLowerCase());
  const words = targets.map((t) => {
    let reason: string | null = null;
    if (t.source === "hovered") {
      const h = find(data.hoveredWords, t.lemma);
      if (h) reason = hoverReason(h, now);
    } else {
      const d = find(data.dueWords, t.lemma);
      if (d) reason = dueReason(d.dueAt, now);
    }
    return { lemma: t.lemma, english: t.english, reason: reason ?? (t.source === "due" ? "Due for review" : t.source === "lesson" ? "Part of today's unit" : "Hovered while reading") };
  });

  const first = data.topErrors[0];
  const unit = data.lesson ? { title: data.lesson.unit.title, canDo: data.lesson.unit.canDo, position: data.lesson.position } : undefined;
  return { article, words, watchError: typeof first === "string" && first.trim() ? formatError(first) : null, ...(unit && { unit }) };
}

function hoverReason(h: TutorContextData["hoveredWords"][number], now: Date): string {
  const ago = timeAgo(h.hoveredAt, now);
  let s = ago ? `Hovered ${ago}` : "Hovered while reading";
  if (h.outcome === "didnt_know") s += ' (you clicked "Didn\'t know")';
  else if (h.outcome === "knew_it") s += ' (you clicked "Knew it")';
  if (typeof h.sentence === "string" && h.sentence.trim()) s += ` in: "${shortSentence(h.sentence, h.lemma)}"`;
  else if (typeof h.articleTitle === "string" && h.articleTitle.trim()) s += ` in "${h.articleTitle}"`;
  return s;
}

function dueReason(dueAt: string, now: Date): string {
  const t = Date.parse(dueAt);
  const days = Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : 0;
  return days >= 1 ? `Due for review (${days} day${days === 1 ? "" : "s"} overdue)` : "Due for review";
}

/** "just now", "5m ago", "2h ago", "3d ago"; null for a missing or unparseable time. */
function timeAgo(iso: string, now: Date): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.floor((now.getTime() - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / (24 * 60))}d ago`;
}

const SENTENCE_MAX = 60;

/** Whitespace-collapsed sentence, cut to ~60 chars at word boundaries around the word when it's long. */
export function shortSentence(sentence: string, lemma: string): string {
  const s = sentence.replace(/\s+/g, " ").trim();
  if (s.length <= SENTENCE_MAX) return s;
  const lower = s.toLowerCase();
  const l = lemma.toLowerCase();
  let at = lower.indexOf(l);
  if (at < 0 && l.length > 4) at = lower.indexOf(l.slice(0, -2)); // verb stems: aprovechar → aprovech(an)
  let start = Math.max(0, Math.min(at - 20, s.length - SENTENCE_MAX)); // ~20 chars before the word, window kept full
  if (start > 0) {
    const sp = s.indexOf(" ", start);
    if (sp >= 0 && sp < at) start = sp + 1; // don't start mid-word
  }
  let end = Math.min(s.length, start + SENTENCE_MAX);
  if (end < s.length) {
    const sp = s.lastIndexOf(" ", end);
    if (sp > start + SENTENCE_MAX / 2) end = sp;
  }
  const body = s.slice(start, end).trim();
  const pre = start > 0 && !body.startsWith("…") ? "…" : "";
  const post = end < s.length && !body.endsWith("…") ? "…" : "";
  return pre + body + post;
}

/** `agreement: "la problema" → "el problema" (3×)` → `la problema → el problema (agreement, 3× last session)`; else as is. */
function formatError(e: string): string {
  const m = /^(\w+): "(.*)" → "(.*)" \((\d+)×\)$/.exec(e.trim());
  if (!m) return e.trim();
  const [, type, span, correction, count] = m;
  return `${span} → ${correction} (${type!.replace(/_/g, " ")}, ${count}× last session)`;
}

export function newSessionId(): string {
  return randomUUID();
}

/** The demo fixture with a fresh sessionId (a fixed id made every session share state). */
export function fixtureContext(): TutorContext {
  // No lesson card on the fallback: the fixture plan's "hovered 2h ago" lines never happened for this learner.
  const { plan: _fixturePlan, ...rest } = tutorContextFixture;
  return { ...rest, sessionId: newSessionId() };
}

export type LoadedContext = { context: TutorContext; source: "db" | "fixture"; reason?: string };

/** Load real context within `timeoutMs`; on throw, timeout or bad data fall back to the fixture. Never throws. */
export async function loadTutorContext(load: () => Promise<TutorContextData>, timeoutMs: number): Promise<LoadedContext> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let p: Promise<TutorContextData>;
    try {
      p = load();
    } catch (err) {
      p = Promise.reject(err); // a sync throw from the loader
    }
    p.catch(() => {}); // swallow a late rejection if the timer wins
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const data = await Promise.race([p, timeout]);
    return { context: buildTutorContext(data, newSessionId()), source: "db" };
  } catch (err) {
    return { context: fixtureContext(), source: "fixture", reason: oneLine(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function oneLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : String(err);
  return msg.split("\n")[0]!.slice(0, 200);
}
