// HACK: local mirror of Andrew's contract in docs/voice-plan.md §4 (shared/src/tutor.ts).
// TODO(demo): replace with imports from /shared once the scaffold lands.

export type WordState = "new" | "seen" | "learning" | "known" | "mastered" | "known_assumed";
export type Level = "beginner" | "intermediate" | "upper_intermediate";

export type SpokenErrorType =
  | "conjugation"
  | "agreement"
  | "word_choice"
  | "word_order"
  | "missing_word"
  | "extra_word";

export interface CorrectionError {
  span: string; // exact substring of rawText
  type: SpokenErrorType;
  correction: string;
  explanation_en: string;
  severity: 1 | 2 | 3;
  confidence: number; // 0..1
  lemma: string | null;
}

export interface TargetWordUse {
  lemma: string;
  correct: boolean;
  form?: string;
}

export interface CorrectionResult {
  utterance_id: string;
  errors: CorrectionError[];
  target_words_used: TargetWordUse[];
  overall_ok: boolean;
}

export interface WordUpdate {
  lemma: string;
  from: WordState;
  to: WordState;
}

// POST /api/tutor/correct response (a wrapper, not a bare CorrectionResult)
export interface CorrectResponse {
  correction: CorrectionResult;
  wordUpdates: WordUpdate[];
  serverMs: number;
}

export interface TargetWord {
  lemma: string;
  article?: string;
  english: string;
  source: "hovered" | "due";
}

export interface TutorContext {
  hoveredWords: { lemma: string; sentence?: string }[];
  dueWords: string[];
  articleTitles: string[];
  level: Level;
  topErrors: string[];
  sessionId: string;
  targetWords: TargetWord[]; // 3–5
}

export interface Recap {
  topErrors: { type: SpokenErrorType; span: string; correction: string; explanation_en: string; count: number }[]; // ≤3
  wordsNowKnown: string[];
  reviewTomorrow: string[];
  summary_en: string;
}

// ---- useTutorSession seam (Andrew's hook; voice-plan §8 hand-off) ----
// Andrew listed only the member names: { status, partial, turns, targetWords, start(), pressTalk(),
// releaseTalk(), sendText(), end(), recap }. The member TYPES below are my guesses.
// TODO(demo): confirm status values and Turn shape with Andrew.

export type TutorStatus = "idle" | "listening" | "checking" | "speaking";

export interface TutorTurn {
  id: string; // utterance id
  rawText: string; // verbatim STT; rendered and graded
  correction?: CorrectionResult; // undefined while "checking"
  wordUpdates?: WordUpdate[];
  tutorText?: string; // streamed Spanish reply for this turn
}

export interface TutorSession {
  status: TutorStatus;
  partial: string; // live partial transcript while the button is held
  turns: TutorTurn[];
  targetWords: TargetWord[];
  recap: Recap | null;
  start: () => void | Promise<void>;
  pressTalk: () => void;
  releaseTalk: () => void;
  sendText: (text: string) => void;
  end: () => void | Promise<void>;
}
