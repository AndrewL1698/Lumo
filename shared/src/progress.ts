import { z } from "zod";
import { Level, WordState } from "./words";

/** D-022: what a tutor session leaves behind for the next one. Stored inside `tutor_sessions.recap.lesson`. */
export const LessonMemory = z.object({
  unitId: z.string(),
  /** Decided in code, not by the model: see lib/curriculum/checkpoint. */
  checkpointPassed: z.boolean(),
  summary_en: z.string(),
  nextStep_en: z.string(),
});
export type LessonMemory = z.infer<typeof LessonMemory>;

export const UnitStatus = z.enum(["done", "current", "locked"]);
export type UnitStatus = z.infer<typeof UnitStatus>;

export const ProgressUnit = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  canDo: z.string(),
  concept: z.string(),
  status: UnitStatus,
  wordsKnown: z.number().int(),
  wordsTotal: z.number().int(),
  checkpointPassed: z.boolean(),
  words: z.array(z.object({ lemma: z.string(), state: WordState })),
});
export type ProgressUnit = z.infer<typeof ProgressUnit>;

/** GET /api/progress (D-022): the learner's course, computed from word states and session recaps. */
export const ProgressResponse = z.object({
  level: Level,
  levelTitle: z.string(), // "Intermediate"
  units: z.array(ProgressUnit),
  currentUnitId: z.string().nullable(), // null = track finished
  lastLesson: LessonMemory.nullable(),
});
export type ProgressResponse = z.infer<typeof ProgressResponse>;
