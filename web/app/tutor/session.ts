// The useTutorSession seam (voice-plan §8). Andrew's real hook lives in web/lib/tutor/client/useTutorSession.ts.
// Andrew listed only the member names: { status, partial, turns, targetWords, start(), pressTalk(),
// releaseTalk(), sendText(), end(), recap }. The member TYPES below are my guesses.
// TODO(demo): confirm status values and Turn shape with Andrew.
import type { CorrectionResult, Recap, TargetWord, WordUpdate } from "@parrot/shared";

export type TutorStatus = "idle" | "listening" | "checking" | "speaking";

export interface TutorTurn {
  id: string; // utterance id
  rawText: string; // verbatim STT; rendered and graded. "" = tutor-only turn (the opener)
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
