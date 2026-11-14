// Learner-model types, copied from docs/architecture.md §4.
// TODO(demo): replace with imports from /shared once Andrew lands the zod schemas.
import type { Card } from "ts-fsrs";

export type WordState = "new" | "seen" | "learning" | "known" | "mastered" | "known_assumed";

export type UserWord = {
  lemma: string;
  state: WordState;
  fsrsCard: Card | null; // null until the first active review
  seenCount: number;
  seenArticles: string[]; // articleKeys, deduped
  lastHoverAt: string | null; // ISO
  dueAt: string | null; // ISO, mirrors fsrsCard.due
};

// Extension events (specs §5.6) plus the two tutor events (correct / incorrect use in speech).
export type EventType =
  | "seen"
  | "hover"
  | "knew_it"
  | "didnt_know"
  | "quiz_pass"
  | "quiz_fail"
  | "speech_correct"
  | "speech_incorrect"
  | "reading";

export type LearnerEvent = {
  id: string;
  type: EventType;
  lemma?: string;
  articleKey: string;
  ts: string; // ISO
  meta?: Record<string, unknown>;
};

export function emptyUserWord(lemma: string): UserWord {
  return { lemma, state: "new", fsrsCard: null, seenCount: 0, seenArticles: [], lastHoverAt: null, dueAt: null };
}
