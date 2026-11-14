// HACK: local mirror of the /shared contract (specs §7.5). Replace with imports from /shared
// once Andrew's scaffold lands. Field names follow specs (snake_case); adjust if /shared differs.

export type ErrorType =
  | "conjugation"
  | "agreement"
  | "word_choice"
  | "word_order"
  | "missing_word"
  | "extra_word";

export interface CorrectionError {
  span: string; // verbatim substring of the raw transcript
  type: ErrorType;
  correction: string;
  explanation_en: string;
  severity: number;
  confidence: number;
  lemma?: string;
}

export interface CorrectionResult {
  utterance_id: string;
  errors: CorrectionError[];
  target_words_used: { lemma: string; correct: boolean }[];
  overall_ok: boolean;
}

// ---- Tutor UI <-> pipeline seam (owned by Shravan; Andrew's real hook supplies the same shape) ----

export type TutorPhase = "idle" | "listening" | "checking" | "speaking";

export interface TutorUtterance {
  id: string;
  raw_text: string; // verbatim STT; this is what we render and what is graded
  correction?: CorrectionResult; // undefined while "checking"
}

export interface TutorSessionState {
  phase: TutorPhase;
  utterances: TutorUtterance[];
  tutorCaption: string; // streamed tutor text for the current/last turn
  newlyKnownLemmas: string[]; // drives the "now known" toast
  recap?: TutorRecap; // set after onEnd
}

export interface TutorRecap {
  // HACK: no shared type yet (/api/tutor/end); mirrors specs §7.8
  topErrors: { type: ErrorType; count: number; example?: string }[];
  wordsNowKnown: string[];
  wordsToReview: string[];
}

export interface TutorSessionActions {
  onPressStart: () => void; // push-to-talk down
  onPressEnd: () => void; // push-to-talk up -> commits utterance
  onEnd: () => void; // end session -> recap
}
