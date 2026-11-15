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
  /** D-019: a key word (recent hover, due, or on the latest recap's weak list): always shown in Spanish, picked first. */
  isKey: z.boolean().optional(),
});
export type Candidate = z.infer<typeof Candidate>;

/**
 * D-019: what the learner has proven, which drives the immersion %. points = 2 × solid + 1 × knewIt.
 * solid = known + mastered words. knewIt = distinct lemmas with a "Knew it" click that aren't solid.
 */
export const Understanding = z.object({
  points: z.number().int().min(0),
  solid: z.number().int().min(0),
  knewIt: z.number().int().min(0),
});
export type Understanding = z.infer<typeof Understanding>;

/** GET /api/candidates */
export const CandidatesResponse = z.object({
  candidates: z.array(Candidate),
  generatedAt: z.number().int(), // epoch ms, for the extension's cache
  /** D-019. Absent when the server couldn't compute it: the extension keeps its last value. */
  understanding: Understanding.optional(),
});
export type CandidatesResponse = z.infer<typeof CandidatesResponse>;
