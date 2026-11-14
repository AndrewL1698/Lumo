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
