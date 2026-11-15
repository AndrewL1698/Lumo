// End-of-session lesson memory (D-022). Pure: no I/O. The checkpoint is decided here in code, never by the model.
import type { LessonMemory } from "@parrot/shared";
import { TUTOR } from "../config";
import type { SessionState } from "../tutor/types";
import { UNITS, type Unit } from "./units";

export const unitById = (id: string): Unit | undefined => UNITS.find((u) => u.id === id);

/**
 * Passed only when the learner spoke at least twice, made no shown mistake of this unit's grammar idea, and used
 * at least one unit word correctly (credited spoken_correct). Never grants "known" itself: that stays word-level.
 */
export function lessonMemoryFor(session: SessionState, unit: Unit, summary: string): LessonMemory {
  const shown = session.allErrors.filter((e) => e.confidence >= TUTOR.showConfidence);
  const conceptError = shown.find((e) => unit.concept.errorTypes.includes(e.type));
  const credited = new Set(session.creditedLemmas.map((l) => l.toLowerCase()));
  const usedUnitWord = unit.words.some((w) => credited.has(w.toLowerCase()));
  const checkpointPassed = session.policy.turnIndex >= 2 && !conceptError && usedUnitWord;

  const nextWord = unit.words.find((w) => !credited.has(w.toLowerCase()));
  const parts: string[] = [];
  if (conceptError) parts.push(`Watch "${conceptError.span}" → "${conceptError.correction}".`);
  if (nextWord) parts.push(`Use ${nextWord} in a sentence.`);
  if (!parts.length) parts.push("Ready for the next step in this unit.");

  return {
    unitId: unit.id,
    checkpointPassed,
    summary_en: summary.trim() || `Practised ${unit.title}.`,
    nextStep_en: parts.join(" "),
  };
}
