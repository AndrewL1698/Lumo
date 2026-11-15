// The useTutorSession seam (voice-plan §8). Andrew's real hook lives in web/lib/tutor/client/useTutorSession.ts.
// Andrew listed only the member names: { status, partial, turns, targetWords, start(), pressTalk(),
// releaseTalk(), sendText(), end(), recap }. The member TYPES below are my guesses.
// TODO(demo): confirm status values and Turn shape with Andrew.
import type { CorrectionResult, Recap, TargetWord, TutorPlan, WordUpdate } from "@parrot/shared";

export type TutorStatus = "idle" | "listening" | "checking" | "speaking";

export interface TutorTurn {
  id: string; // utterance id
  rawText: string; // verbatim STT; rendered and graded. "" = tutor-only turn (the opener)
  correction?: CorrectionResult; // undefined while "checking"
  wordUpdates?: WordUpdate[];
  tutorText?: string; // streamed Spanish reply for this turn
  correctionFailed?: boolean; // real hook sets this when the correction call failed
  tutorEnglish?: string; // English translation; the page hides it until the learner has answered (no peeking)
  why?: string; // J1: one English line on why the tutor replied the way it did
  // TODO(demo): agree with Andrew where the real translation comes from.
}

export interface TutorSession {
  status: TutorStatus;
  partial: string; // live partial transcript while the button is held
  turns: TutorTurn[];
  targetWords: TargetWord[];
  recap: Recap | null;
  notice?: string | null; // real hook: ready-to-show English message when something degrades (mic blocked, etc.)
  plan?: TutorPlan | null; // J2 "Tonight's lesson" card; absent or null = no card
  start: () => void | Promise<void>;
  pressTalk: () => void;
  releaseTalk: () => void;
  sendText: (text: string) => void;
  end: () => void | Promise<void>;
  // Hands-free (D-023), all optional: the mock tutor and the level check have no hands-free mode.
  mode?: "ptt" | "handsfree";
  setMode?: (mode: "ptt" | "handsfree") => void;
  muted?: boolean;
  setMuted?: (muted: boolean) => void;
}
