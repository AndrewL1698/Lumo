/**
 * Seams between the voice-tutor modules (voice-plan §3). Types only: no runtime code, no DOM/Node imports.
 * Owner: Andrew. Module authors implement these; do not change them without asking.
 */
import type {
  CorrectionError,
  CorrectionResult,
  CorrectResponse,
  HistoryTurn,
  Level,
  Recap,
  SpokenErrorType,
  SttPath,
  TargetWord,
  TargetWordUse,
  TurnFlag,
  TurnTimeline,
  TutorContext,
  WordUpdate,
} from "@parrot/shared";

// ---------- correction lane (claude.ts → validate.ts → session.ts) ----------

/** What Haiku returns (voice-plan §5a). Ranges are NOT enforced by the API; validate.ts checks them. */
export type ModelCorrectionError = {
  span: string;
  type: SpokenErrorType;
  correction: string;
  explanation_en: string;
  severity: number;
  confidence: number;
  lemma: string | null;
};
export type ModelCorrection = {
  /** What kind of turn this was; "answered" or absent = a normal Spanish answer. */
  answer?: "answered" | TurnFlag;
  /** With answer "english": what the learner said, in Spanish. */
  spanish_version?: string | null;
  errors: ModelCorrectionError[];
  target_words_used: { lemma: string; form: string; correct: boolean }[];
  overall_ok: boolean;
};

/** validate.ts: validateCorrection(rawText, model) → ValidatedCorrection */
export type ValidatedCorrection = {
  /** Shown on screen: span is a substring of rawText, not accent/punctuation-only, confidence >= SHOW. */
  shown: CorrectionError[];
  /** Everything valid with confidence >= KEEP (superset of `shown`); feeds policy and target-word checks. */
  kept: CorrectionError[];
  target_words_used: TargetWordUse[];
  /** Recomputed: true iff `shown` is empty and there is no `flag`. */
  overall_ok: boolean;
  /** Set only when the turn is English, off topic or unclear. English and unclear turns carry no errors. */
  flag?: TurnFlag;
  spanish_version?: string;
};

/** validate.ts: validateTargetWords(args) → TargetWordVerdict[] (voice-plan §1.6; applied in task 12). */
export type TargetWordVerdict = {
  lemma: string;
  event: "spoken_correct" | "spoken_incorrect" | null; // null = no learner-model event
  reason: string; // short, for logs
};
export type ValidateTargetWordsArgs = {
  rawText: string;
  targets: TargetWord[];
  used: TargetWordUse[];
  kept: CorrectionError[];
  alreadyCredited: string[]; // lemmas credited earlier this session
  /** The tutor's previous reply, for the echo rule (task 12). */
  tutorPrevious?: string;
};

// ---------- policy (policy.ts, pure) ----------

export type PolicyState = {
  /** Number of learner turns so far; 0 before the first utterance (the opener). */
  turnIndex: number;
  /** turnIndex of the last explicit spoken correction, or null. */
  lastSpokenCorrectionTurn: number | null;
  /** Count per error key `${type}:${lemma ?? span}`. */
  errorCounts: Record<string, number>;
  /** Latest example per error key, for the directive text. */
  errorExamples: Record<string, { span: string; correction: string; reason: string }>;
  /** Previous turn's kept errors. */
  lastErrors: CorrectionError[];
  targetLemmas: string[];
  usedLemmas: string[];
};

export type TurnDirective = {
  correction: "none" | { span: string; correction: string; reason: string };
  steerLemma: string | null;
  isOpener: boolean;
};

// ---------- session store (session.ts, server memory on globalThis) ----------

export type SessionState = {
  sessionId: string;
  context: TutorContext;
  policy: PolicyState;
  creditedLemmas: string[];
  /**
   * true once /api/tutor/context set this session's context. Sessions it never started (eval runs,
   * a server restart mid-session) run on the fixture context and must never write learner events.
   */
  fromContext: boolean;
  /** For the recap (task 14). */
  allErrors: CorrectionError[];
};

// ---------- prompts (prompts.ts) ----------

export type CorrectorPromptArgs = {
  rawText: string;
  level: Level;
  targetWords: TargetWord[];
  tutorPrevious?: string;
};
export type TutorPromptArgs = {
  context: TutorContext;
  history: HistoryTurn[];
  rawText: string | null; // null = opener
  directive: TurnDirective;
};
export type ClaudeMessage = { role: "user" | "assistant"; content: string };

// ---------- chunker (chunker.ts, pure) ----------

export interface Chunker {
  /** Feed a text delta; returns any chunks completed by it (trimmed, non-empty). */
  push(delta: string): string[];
  /** End of stream: returns the remainder as a final chunk, if any. */
  flush(): string[];
}

// ---------- realtime STT client (client/scribeRealtime.ts; browser AND Node 24) ----------

/** Minimal WebSocket surface so tests can inject a fake. */
export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
};
export type WebSocketCtor = new (url: string) => WebSocketLike;

export type ScribeOptions = {
  token: string;
  model: string;
  languageCode?: string; // default "es"
  sampleRate?: number; // default 16000
  onPartial?: (text: string) => void;
  WebSocketImpl?: WebSocketCtor; // default globalThis.WebSocket
};

export interface ScribeClient {
  /** Queue or send one PCM16 mono chunk. Chunks sent before the socket opens are buffered. */
  sendAudio(pcm: Int16Array): void;
  /**
   * Send `lastChunk` with commit:true and resolve with the committed transcript, verbatim.
   * Resolves "" for insufficient_audio_activity. Rejects on any other error, close, or timeout.
   */
  commit(lastChunk: Int16Array, timeoutMs: number): Promise<string>;
  close(): void;
}

// ---------- push-to-talk recorder (client/pttRecorder.ts, browser) ----------

export interface PttRecorder {
  /** Ask for the mic and load the worklet once. */
  init(): Promise<void>;
  /** Start capturing; `onChunk` gets ~100 ms PCM16 16 kHz mono chunks. */
  start(onChunk: (pcm: Int16Array) => void): void;
  /** Stop after `tailMs` more audio. `pcm` is the whole take; `tail` is the audio captured after stop() was called. */
  stop(tailMs: number): Promise<{ pcm: Int16Array; tail: Int16Array; durationMs: number }>;
  dispose(): void;
}

// ---------- audio queue (client/audioQueue.ts, browser) ----------

export interface AudioQueue {
  /**
   * Fetch TTS for `text` now, play it after every earlier chunk of the same turn.
   * `onStart` fires when this chunk's audio actually starts. A failed chunk is skipped (captions only).
   */
  enqueue(turn: number, index: number, text: string, onStart?: () => void): void;
  /** Stop everything, abort pending fetches, and ignore results from turns <= the current one. */
  stopAll(): void;
  /** Resolves when the given turn has finished playing (or was stopped). */
  idle(turn: number): Promise<void>;
}

// ---------- timeline (client/timeline.ts) ----------

export type TimelineMark = Exclude<keyof TurnTimeline, "sessionId" | "utteranceId" | "sttPath">;

export interface TimelineRecorder {
  /** Record `performance.now()` for a mark; only the first call per mark counts. */
  mark(name: TimelineMark): void;
  setSttPath(path: SttPath): void;
  /** null until tPress, tRelease and tSttFinal are all set. */
  toTimeline(): TurnTimeline | null;
}

// ---------- the hook Shravan's UI uses (client/useTutorSession.ts) ----------
// Shravan's page already codes against `TutorSession` in web/app/tutor/session.ts (his guess at this seam).
// These types are a structural SUPERSET of his, so the real hook drops into his page with a one-line import
// change. Do not rename or narrow anything his file declares.

export type TutorStatus = "idle" | "listening" | "checking" | "speaking";

export type Turn = {
  id: string; // utteranceId; "opener" for the tutor-only first turn
  rawText: string; // verbatim transcript, never edited. "" = tutor-only turn (the opener)
  correction?: CorrectionResult; // undefined while the correction lane is pending
  wordUpdates?: WordUpdate[];
  tutorText?: string; // streamed Spanish reply for this turn (captions)
  tutorEnglish?: string; // English for tutorText, from /api/tutor/translate; unset if that call failed
  // --- extras his UI may ignore ---
  sttPath?: SttPath;
  /** true if the correction lane failed or timed out; `correction` is then an empty, overall_ok result. */
  correctionFailed?: boolean;
};

export type UseTutorSession = {
  status: TutorStatus;
  /** Live partial transcript while the button is held; "" otherwise. */
  partial: string;
  turns: Turn[];
  targetWords: TargetWord[];
  recap: Recap | null;
  start: () => Promise<void>;
  pressTalk: () => void;
  releaseTalk: () => void;
  sendText: (text: string) => void;
  end: () => Promise<void>;
  // --- extras his UI may ignore ---
  /** One-line English message when something degraded (e.g. "Didn't catch that, try again"). */
  notice: string | null;
  /** Last completed turn's timings, for ?debug=1. */
  lastTimeline: TurnTimeline | null;
  /** J2 "Today's lesson" card from /api/tutor/context; null before start() or when the server sent none. */
  plan: TutorContext["plan"] | null;
};

export type { CorrectResponse };
