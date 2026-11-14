/** Spoken-correction policy (voice-plan §1.3). Pure: no I/O, no clock. */
import type { CorrectionError } from "@parrot/shared";
import type { PolicyState, TurnDirective } from "./types";

const MIN_TURNS_BETWEEN_CORRECTIONS = 3;
const MIN_REPEATS = 2;

/** Key an error is counted under: `${type}:${lemma ?? span}`, lowercased. */
export function errorKey(e: Pick<CorrectionError, "type" | "lemma" | "span">): string {
  return `${e.type}:${e.lemma ?? e.span}`.toLowerCase();
}

export function nextDirective(state: PolicyState): TurnDirective {
  const { turnIndex, lastSpokenCorrectionTurn: last } = state;

  // (1) explicit correction: >= 3 turns since the last one AND a key seen >= 2 times; most frequent wins.
  let correction: TurnDirective["correction"] = "none";
  const turnsSince = last === null ? turnIndex : turnIndex - last;
  if (turnsSince >= MIN_TURNS_BETWEEN_CORRECTIONS) {
    let best = 0;
    for (const [key, count] of Object.entries(state.errorCounts)) {
      const example = state.errorExamples[key];
      // Strict ">" keeps the earliest-seen key on a tie.
      if (count >= MIN_REPEATS && count > best && example) {
        best = count;
        correction = { span: example.span, correction: example.correction, reason: example.reason };
      }
    }
  }

  // (3) from turn 2, on every other turn, steer toward the next unused target word.
  let steerLemma: string | null = null;
  if (turnIndex >= 2 && turnIndex % 2 === 0) {
    const used = new Set(state.usedLemmas.map((l) => l.toLowerCase()));
    steerLemma = state.targetLemmas.find((l) => !used.has(l.toLowerCase())) ?? null;
  }

  return { correction, steerLemma, isOpener: turnIndex === 0 };
}
