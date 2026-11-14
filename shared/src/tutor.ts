import { z } from "zod";
import { Level, WordState } from "./words";

/** Error types graded in spoken mode. Accent/punctuation/spelling are never graded from speech (specs §7.2). */
export const SpokenErrorType = z.enum([
  "conjugation",
  "agreement",
  "word_choice",
  "word_order",
  "missing_word",
  "extra_word",
]);
export type SpokenErrorType = z.infer<typeof SpokenErrorType>;

export const CorrectionError = z.object({
  span: z.string(), // exact substring of the raw transcript; the server drops it otherwise
  type: SpokenErrorType,
  correction: z.string(),
  explanation_en: z.string(),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  confidence: z.number().min(0).max(1),
  lemma: z.string().nullable(),
});
export type CorrectionError = z.infer<typeof CorrectionError>;

export const TargetWordUse = z.object({
  lemma: z.string(),
  correct: z.boolean(),
  form: z.string().optional(), // exact spoken form; required for a "known" flip
});
export type TargetWordUse = z.infer<typeof TargetWordUse>;

/** Correction lane output (specs §7.5). `utterance_id` is set by the server, not the model. */
export const CorrectionResult = z.object({
  utterance_id: z.string(),
  errors: z.array(CorrectionError),
  target_words_used: z.array(TargetWordUse),
  overall_ok: z.boolean(),
});
export type CorrectionResult = z.infer<typeof CorrectionResult>;

export const TargetWord = z.object({
  lemma: z.string(),
  article: z.string().optional(),
  english: z.string(),
  source: z.enum(["hovered", "due"]),
});
export type TargetWord = z.infer<typeof TargetWord>;

/** GET /api/tutor/context (architecture §4 plus sessionId and targetWords). */
export const TutorContext = z.object({
  sessionId: z.string(),
  hoveredWords: z.array(z.object({ lemma: z.string(), sentence: z.string().optional() })),
  dueWords: z.array(z.string()),
  articleTitles: z.array(z.string()),
  level: Level,
  topErrors: z.array(z.string()),
  targetWords: z.array(TargetWord).max(5),
});
export type TutorContext = z.infer<typeof TutorContext>;

export const WordUpdate = z.object({ lemma: z.string(), from: WordState, to: WordState });
export type WordUpdate = z.infer<typeof WordUpdate>;

export const SttPath = z.enum(["realtime", "batch", "typed"]);
export type SttPath = z.infer<typeof SttPath>;

/** POST /api/tutor/correct */
export const CorrectRequest = z.object({
  sessionId: z.string(),
  utteranceId: z.string(),
  rawText: z.string().min(1), // verbatim STT output; never edited
  tutorPrevious: z.string().optional(),
  sttPath: SttPath,
});
export type CorrectRequest = z.infer<typeof CorrectRequest>;

export const CorrectResponse = z.object({
  correction: CorrectionResult,
  wordUpdates: z.array(WordUpdate),
  serverMs: z.number(),
});
export type CorrectResponse = z.infer<typeof CorrectResponse>;

export const HistoryTurn = z.object({ role: z.enum(["tutor", "learner"]), text: z.string() });
export type HistoryTurn = z.infer<typeof HistoryTurn>;

/** POST /api/tutor/reply → text/plain stream. `rawText: null` = session opener. */
export const ReplyRequest = z.object({
  sessionId: z.string(),
  utteranceId: z.string().nullable(),
  rawText: z.string().nullable(),
  history: z.array(HistoryTurn),
});
export type ReplyRequest = z.infer<typeof ReplyRequest>;

/** POST /api/tutor/end */
export const EndRequest = z.object({ sessionId: z.string() });
export type EndRequest = z.infer<typeof EndRequest>;

export const Recap = z.object({
  topErrors: z
    .array(
      z.object({
        type: SpokenErrorType,
        span: z.string(),
        correction: z.string(),
        explanation_en: z.string(),
        count: z.number().int(),
      }),
    )
    .max(3),
  wordsNowKnown: z.array(z.string()),
  reviewTomorrow: z.array(z.string()),
  summary_en: z.string(),
  tips: z.array(z.string()), // one-line rule + example per top error; [] if the model call fails
});
export type Recap = z.infer<typeof Recap>;

/** POST /api/tutor/metrics — per-turn timestamps (performance.now() ms) for latency numbers. */
export const TurnTimeline = z.object({
  sessionId: z.string(),
  utteranceId: z.string(),
  sttPath: SttPath,
  tPress: z.number(),
  tRelease: z.number(),
  tSttFinal: z.number(),
  tCorrectionShown: z.number().nullable(),
  tReplyFirstToken: z.number().nullable(),
  tFirstChunk: z.number().nullable(),
  tTtsFirstBytes: z.number().nullable(),
  tAudioStart: z.number().nullable(),
});
export type TurnTimeline = z.infer<typeof TurnTimeline>;

/** GET /api/stt-token — single-use ElevenLabs realtime token (15 min, consumed on first use). */
export const SttTokenResponse = z.object({ token: z.string(), model: z.string() });
export type SttTokenResponse = z.infer<typeof SttTokenResponse>;

/** POST /api/stt-batch response (request body is audio/wav). */
export const SttBatchResponse = z.object({ text: z.string() });
export type SttBatchResponse = z.infer<typeof SttBatchResponse>;
