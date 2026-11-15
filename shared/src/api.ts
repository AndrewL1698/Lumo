import { z } from "zod";
import { LearnerEventType } from "./events";
import { IsoDate, Level, UserWord, WordState } from "./words";

/** Error body for any non-2xx JSON response. */
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

/** POST /api/pair — 6-digit code shown in the web app → extension bearer token. */
export const PairRequest = z.object({ code: z.string().regex(/^\d{6}$/) });
export type PairRequest = z.infer<typeof PairRequest>;

export const PairResponse = z.object({ token: z.string() });
export type PairResponse = z.infer<typeof PairResponse>;

/** POST /api/tts — hover-card pronunciation and tutor speech. Response is audio/mpeg. */
export const TtsRequest = z.object({
  text: z.string().min(1).max(500),
  lemma: z.string().optional(),
  level: Level.optional(), // tutor speech only: the server slows the voice down for lower levels
});
export type TtsRequest = z.infer<typeof TtsRequest>;

/** GET /api/vocab (specs §6.3). */
export const VocabItem = z.object({
  lemma: z.string(),
  article: z.string().nullable(),
  english: z.string(),
  state: WordState,
  dueAt: IsoDate.nullable(),
});
export type VocabItem = z.infer<typeof VocabItem>;

export const VocabResponse = z.object({
  learning: z.array(VocabItem),
  known: z.array(VocabItem), // "Your vocabulary"
  mastered: z.array(VocabItem),
  counts: z.object({
    learning: z.number().int(),
    known: z.number().int(),
    mastered: z.number().int(),
  }),
  streakDays: z.number().int(),
});
export type VocabResponse = z.infer<typeof VocabResponse>;

/** GET /api/data — everything Parrot stores ("What Parrot knows" page). */
export const StoredEvent = z.object({
  id: z.string(),
  type: LearnerEventType,
  lemma: z.string().nullable(),
  articleKey: z.string().nullable(),
  ts: IsoDate,
});
export type StoredEvent = z.infer<typeof StoredEvent>;

export const StoredArticle = z.object({
  id: z.string(),
  articleKey: z.string(),
  title: z.string(),
  domain: z.string(),
  ts: IsoDate,
});
export type StoredArticle = z.infer<typeof StoredArticle>;

export const DataResponse = z.object({
  words: z.array(UserWord),
  events: z.array(StoredEvent),
  articles: z.array(StoredArticle),
});
export type DataResponse = z.infer<typeof DataResponse>;

/** DELETE /api/data — one item, or everything. */
export const DataDeleteRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("word"), lemma: z.string() }),
  z.object({ kind: z.literal("event"), id: z.string() }),
  z.object({ kind: z.literal("article"), id: z.string() }),
  z.object({ kind: z.literal("all") }),
]);
export type DataDeleteRequest = z.infer<typeof DataDeleteRequest>;

export const DataDeleteResponse = z.object({ deleted: z.number().int() });
export type DataDeleteResponse = z.infer<typeof DataDeleteResponse>;
