import { z } from "zod";

/** Evidence levels for a word (specs §6.1). */
export const WordState = z.enum([
  "new",
  "seen",
  "learning",
  "known",
  "mastered",
  "known_assumed",
]);
export type WordState = z.infer<typeof WordState>;

/** Learner level picked at onboarding; also the word-list difficulty band (specs §3). */
export const Level = z.enum(["beginner", "intermediate", "upper_intermediate"]);
export type Level = z.infer<typeof Level>;
export const Band = Level;
export type Band = Level;

export const PartOfSpeech = z.enum(["noun", "verb", "adj", "adv"]);
export type PartOfSpeech = z.infer<typeof PartOfSpeech>;

/** One row of the `words` table (architecture §5), camelCased. */
export const Word = z.object({
  lemma: z.string(),
  rank: z.number().int(),
  pos: PartOfSpeech,
  gender: z.enum(["m", "f"]).nullable(),
  article: z.string().nullable(),
  english: z.array(z.string()),
  englishForms: z.array(z.string()),
  cognate: z.boolean(),
  falseFriend: z.boolean(),
  band: Band,
});
export type Word = z.infer<typeof Word>;

/** ISO-8601 timestamp string. */
export const IsoDate = z.string().datetime({ offset: true });

/** One row of `user_words` (architecture §4/§5). `fsrsCard` is opaque here so /shared doesn't depend on ts-fsrs. */
export const UserWord = z.object({
  lemma: z.string(),
  state: WordState,
  fsrsCard: z.record(z.string(), z.unknown()).nullable(),
  seenCount: z.number().int().min(0),
  seenArticles: z.array(z.string()),
  lastHoverAt: IsoDate.nullable(),
  dueAt: IsoDate.nullable(),
});
export type UserWord = z.infer<typeof UserWord>;
