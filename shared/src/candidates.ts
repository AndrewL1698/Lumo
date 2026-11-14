import { z } from "zod";
import { WordState } from "./words";

/** Scoring flags for one word (architecture §4; formula in specs §5.2). The word list itself is bundled in the extension. */
export const Candidate = z.object({
  lemma: z.string(),
  state: WordState,
  isDue: z.boolean(),
  hoveredRecently: z.boolean(),
  onWeakList: z.boolean(),
  isNewInBand: z.boolean(),
  isMastered: z.boolean(),
});
export type Candidate = z.infer<typeof Candidate>;

/** GET /api/candidates */
export const CandidatesResponse = z.object({
  candidates: z.array(Candidate),
  generatedAt: z.number().int(), // epoch ms, for the extension's cache
});
export type CandidatesResponse = z.infer<typeof CandidatesResponse>;
