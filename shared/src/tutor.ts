import { z } from "zod";
import { LessonMemory } from "./progress";
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

/** Why a turn is not a normal Spanish answer. The UI shows a line for it instead of "No mistakes found". */
export const TurnFlag = z.enum(["english", "off_topic", "unclear"]);
export type TurnFlag = z.infer<typeof TurnFlag>;

/** Correction lane output (specs §7.5). `utterance_id` is set by the server, not the model. */
export const CorrectionResult = z.object({
  utterance_id: z.string(),
  errors: z.array(CorrectionError),
  target_words_used: z.array(TargetWordUse),
  overall_ok: z.boolean(),
  flag: TurnFlag.optional(), // absent = a normal Spanish answer
  spanish_version: z.string().optional(), // only with flag "english": what they said, in Spanish
});
export type CorrectionResult = z.infer<typeof CorrectionResult>;

export const TargetWord = z.object({
  lemma: z.string(),
  article: z.string().optional(),
  english: z.string(),
  source: z.enum(["hovered", "due", "lesson"]), // "lesson" = a word from today's course unit (D-022)
});
export type TargetWord = z.infer<typeof TargetWord>;

/** D-022: today's course unit as the tutor sees it. Absent = no course (flag off, DB down, level check). */
export const LessonContext = z.object({
  unitId: z.string(),
  title: z.string(),
  canDo: z.string(),
  concept: z.string(), // concept name
  teach: z.string(), // the one-sentence rule plus an example
  position: z.string(), // "Intermediate · Unit 1 of 4"
  prompts: z.array(z.string()),
  lastTime: z.string().optional(), // summary of the last session on this track
  nextStep: z.string().optional(),
});
export type LessonContext = z.infer<typeof LessonContext>;

/** J2 "Today's lesson" card: what the tutor planned and why, built in code from the learner data (no model call). English only. */
export const TutorPlan = z.object({
  article: z.object({ title: z.string(), why: z.string() }).nullable(), // e.g. why: "You read it today and hovered 3 words in it"
  words: z.array(z.object({ lemma: z.string(), english: z.string(), reason: z.string() })), // same order as targetWords
  watchError: z.string().nullable(), // e.g. "la problema → el problema (agreement, 3× last session)"
  unit: z.object({ title: z.string(), canDo: z.string(), position: z.string() }).optional(), // D-022
});
export type TutorPlan = z.infer<typeof TutorPlan>;

/** GET /api/tutor/context (architecture §4 plus sessionId and targetWords). */
export const TutorContext = z.object({
  sessionId: z.string(),
  hoveredWords: z.array(z.object({ lemma: z.string(), sentence: z.string().optional() })),
  dueWords: z.array(z.string()),
  articleTitles: z.array(z.string()),
  level: Level,
  topErrors: z.array(z.string()),
  targetWords: z.array(TargetWord).max(5),
  plan: TutorPlan.optional(), // absent = no lesson card (e.g. building the plan failed)
  lesson: LessonContext.optional(), // D-022
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

/** POST /api/tutor/translate — English for one finished tutor line, shown under its bubble. */
export const TutorTranslateRequest = z.object({ text: z.string().min(1).max(1000) });
export type TutorTranslateRequest = z.infer<typeof TutorTranslateRequest>;

export const TutorTranslateResponse = z.object({ english: z.string() });
export type TutorTranslateResponse = z.infer<typeof TutorTranslateResponse>;

/** POST /api/tutor/placement: the onboarding level check (D-020). `history` holds the check's turns. */
export const PlacementRequest = z.object({ sessionId: z.string(), history: z.array(HistoryTurn) });
export type PlacementRequest = z.infer<typeof PlacementRequest>;

/** A suggested level with a plain-English reason. The learner accepts it or keeps their own pick. */
export const PlacementResponse = z.object({
  level: Level,
  reason_en: z.string(),
  evidence_en: z.array(z.string()),
});
export type PlacementResponse = z.infer<typeof PlacementResponse>;

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
  lesson: LessonMemory.optional(), // D-022: which unit this session worked on, checkpoint, next step
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
