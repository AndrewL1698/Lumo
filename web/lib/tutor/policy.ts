/** Spoken-correction policy (voice-plan §1.3). Pure: no I/O, no clock. */
import type { CorrectionError } from "@parrot/shared";
import type { PolicyState, TurnDirective } from "./types";

const MIN_TURNS_BETWEEN_CORRECTIONS = 3;
const MIN_REPEATS = 2;

/** Key an error is counted under: `${type}:${lemma ?? span}`, lowercased. */
export function errorKey(e: Pick<CorrectionError, "type" | "lemma" | "span">): string {
  return `${e.type}:${e.lemma ?? e.span}`.toLowerCase();
}

export function nextDirective(state: PolicyState): TurnDirective & { why: string } {
  const { turnIndex, lastSpokenCorrectionTurn: last } = state;

  // (1) explicit correction: >= 3 turns since the last one AND a key seen >= 2 times; most frequent wins.
  let correction: TurnDirective["correction"] = "none";
  const turnsSince = last === null ? turnIndex : turnIndex - last;
  let best = 0;
  if (turnsSince >= MIN_TURNS_BETWEEN_CORRECTIONS) {
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

  const isOpener = turnIndex === 0;
  return { correction, steerLemma, isOpener, why: whyLine(state, correction, best, steerLemma, isOpener) };
}

/**
 * J1: one short English line for the UI. The reply lane runs in parallel with the correction lane, so this only
 * knows EARLIER turns: never claim anything about the current utterance. The reply route refines the opener and
 * steer lines with context it has (article titles, why a target word was picked).
 */
export const WHY = {
  opener: "Opening with something you read today",
  openerEveryday: "Opening with an everyday question",
  talking: "Just talking: keeping the conversation going",
} as const;

function whyLine(
  state: PolicyState,
  correction: TurnDirective["correction"],
  count: number,
  steerLemma: string | null,
  isOpener: boolean,
): string {
  if (isOpener) return WHY.opener;
  if (correction !== "none") return `Explained out loud: '${correction.span}' has come up ${count} times`;
  if (steerLemma) return `Steering toward '${steerLemma}'`;
  const counts = Object.values(state.errorCounts);
  if (counts.some((c) => c >= MIN_REPEATS))
    return "Recasting quietly: Luci spaces out spoken corrections";
  if (counts.some((c) => c >= 1)) return "Not correcting out loud yet: Luci waits until a mistake repeats";
  return WHY.talking;
}
