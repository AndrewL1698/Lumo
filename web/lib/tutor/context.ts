/**
 * Tutor session context (task 10): turns Karthik's TutorContextData into the shared TutorContext.
 * Pure except randomUUID; no db/learner imports (only the type) so checks run offline.
 */
import { randomUUID } from "node:crypto";
import { TutorContext, tutorContextFixture } from "@parrot/shared";
import type { TargetWord } from "@parrot/shared";
import type { TutorContextData } from "../learner/queries";

const MAX_HOVERED_TARGETS = 3;
const MAX_DUE_TARGETS = 2;
const MAX_TARGETS = 5;

type WordLike = { lemma: string; article: string | null; english: string; cognate: boolean };

/** Up to 3 newest hovered words, then up to 2 most-overdue due words. Skips cognates, unlisted words, duplicates. */
export function pickTargetWords(data: TutorContextData): TargetWord[] {
  const out: TargetWord[] = [];
  const seen = new Set<string>();
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
  take(data.hoveredWords, "hovered", MAX_HOVERED_TARGETS);
  take(data.dueWords, "due", MAX_DUE_TARGETS);
  return out;
}

export function buildTutorContext(data: TutorContextData, sessionId: string): TutorContext {
  return TutorContext.parse({
    sessionId,
    hoveredWords: data.hoveredWords.map((h) => (h.sentence === undefined ? { lemma: h.lemma } : { lemma: h.lemma, sentence: h.sentence })),
    dueWords: data.dueWords.map((d) => d.lemma),
    articleTitles: data.articleTitles,
    level: data.level,
    topErrors: data.topErrors,
    targetWords: pickTargetWords(data),
  });
}

export function newSessionId(): string {
  return randomUUID();
}

/** The demo fixture with a fresh sessionId (a fixed id made every session share state). */
export function fixtureContext(): TutorContext {
  return { ...tutorContextFixture, sessionId: newSessionId() };
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
