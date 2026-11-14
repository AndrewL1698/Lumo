// Learner model: one event in, one updated UserWord out. Pure (no DB, no clock reads).
// Spec: docs/specs.md §6.1 (state machine) + §6.2 (FSRS mapping); docs/architecture.md §7.
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { LearnerEvent, UserWord, WordState } from "./types";

// /shared keeps fsrsCard opaque (Record) so it doesn't depend on ts-fsrs; we know its real shape here.
const asCard = (c: UserWord["fsrsCard"]): Card | null => (c ? (c as unknown as Card) : null);

const scheduler = fsrs();

export const MASTERED_STABILITY_DAYS = 60;
// `seen` without hover moves a word to `learning` after this much passive exposure (§6.1).
const SEEN_TO_LEARNING_COUNT = 3;
const SEEN_TO_LEARNING_ARTICLES = 2;

// Which events create an FSRS review, and with what rating. `seen` and `reading` create none.
const RATING: Partial<Record<LearnerEvent["type"], Grade>> = {
  hover: Rating.Again,
  didnt_know: Rating.Again,
  quiz_fail: Rating.Again,
  spoken_incorrect: Rating.Again,
  knew_it: Rating.Good,
  quiz_pass: Rating.Good,
  spoken_correct: Rating.Easy,
};

const ACTIVE_KNOWN: ReadonlySet<LearnerEvent["type"]> = new Set(["quiz_pass", "spoken_correct"]);
const KNOWNISH: ReadonlySet<WordState> = new Set(["known", "mastered", "known_assumed"]);

function review(card: Card | null, now: Date, grade: Grade): Card {
  return scheduler.next(card ?? createEmptyCard(now), now, grade).card;
}

export function applyEvent(word: UserWord, event: LearnerEvent, now: Date = new Date(event.ts)): UserWord {
  const next: UserWord = { ...word, seenArticles: [...word.seenArticles] };

  if (event.type === "reading") return next;

  if (event.type === "seen") {
    next.seenCount += 1;
    if (event.articleKey && !next.seenArticles.includes(event.articleKey)) next.seenArticles.push(event.articleKey);
    if (next.state === "new") next.state = "seen";
    if (
      next.state === "seen" &&
      next.seenCount >= SEEN_TO_LEARNING_COUNT &&
      next.seenArticles.length >= SEEN_TO_LEARNING_ARTICLES
    ) {
      next.state = "learning";
    }
    return next; // weak evidence: never a review, never `known`
  }

  const grade = RATING[event.type];
  if (grade === undefined) return next;

  if (event.type === "hover") next.lastHoverAt = now.toISOString();

  const card = review(asCard(next.fsrsCard), now, grade);
  next.fsrsCard = card as unknown as UserWord["fsrsCard"];
  next.dueAt = new Date(card.due).toISOString();

  if (grade === Rating.Again) {
    // Hover, didn't-know, quiz fail, wrong in speech: (back) to learning, from any state.
    next.state = "learning";
  } else if (ACTIVE_KNOWN.has(event.type)) {
    // Active evidence is the only way into `known` (§6.1 rule).
    if (!KNOWNISH.has(next.state) || next.state === "known_assumed") next.state = "known";
  } else if (next.state === "new" || next.state === "seen") {
    // knew_it is self-report: good for FSRS, but only lifts a word to `learning`.
    next.state = "learning";
  }

  if ((next.state === "known" || next.state === "mastered") && card.stability >= MASTERED_STABILITY_DAYS) {
    next.state = "mastered";
  }
  return next;
}

export function isDue(word: UserWord, now: Date): boolean {
  return word.dueAt !== null && new Date(word.dueAt) <= now;
}
