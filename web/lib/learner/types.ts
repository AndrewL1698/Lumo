// Learner-model types come from /shared (the contract). Only the glue lives here.
import type { LearnerEventType, UserWord, WordState } from "@parrot/shared";

export type { LearnerEventType, UserWord, WordState };

// An event as the learner model consumes it: extension events and tutor events share this shape.
// `ts` is epoch ms, matching ExtensionEvent in /shared.
export type LearnerEvent = {
  id: string;
  type: LearnerEventType;
  lemma?: string;
  articleKey: string;
  ts: number;
  meta?: Record<string, unknown>;
};

export function emptyUserWord(lemma: string): UserWord {
  return { lemma, state: "new", fsrsCard: null, seenCount: 0, seenArticles: [], lastHoverAt: null, dueAt: null };
}
