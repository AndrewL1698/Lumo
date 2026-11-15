import { z } from "zod";

/** POST /api/translate (architecture §4, §9). One batch per page. */
export const TranslateRequest = z.object({
  articleKey: z.string(),
  items: z
    .array(
      z.object({
        sentence: z.string(),
        lemma: z.string(),
        englishMatch: z.string(), // the English token(s) matched in the sentence
      }),
    )
    .min(1),
});
export type TranslateRequest = z.infer<typeof TranslateRequest>;

/**
 * One result per request item, same order. `span` is the exact English text to replace,
 * including its determiner ("the houses"); `replacement` is the inflected Spanish ("las casas").
 * `null` = sense mismatch, don't swap.
 */
export const TranslateItem = z
  .object({
    span: z.string(),
    replacement: z.string(),
    lemma: z.string(),
  })
  .nullable();
export type TranslateItem = z.infer<typeof TranslateItem>;

export const TranslateResponse = z.object({ items: z.array(TranslateItem) });
export type TranslateResponse = z.infer<typeof TranslateResponse>;

/**
 * POST /api/translate-sentences (D-018, immersion dial). Whole sentences or plain paragraphs from the page the
 * learner is reading, turned into natural Latin American Spanish. Bearer token required.
 */
export const SentenceTranslateRequest = z.object({
  articleKey: z.string(),
  sentences: z.array(z.string().min(1).max(2000)).min(1).max(40),
});
export type SentenceTranslateRequest = z.infer<typeof SentenceTranslateRequest>;

/** One entry per request sentence, same order. `null` = unusable: leave that text in English. */
export const SentenceTranslateResponse = z.object({ items: z.array(z.string().nullable()) });
export type SentenceTranslateResponse = z.infer<typeof SentenceTranslateResponse>;
