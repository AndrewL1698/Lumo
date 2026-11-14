// How many words a page may swap, and how difficult never-met words may be (decisions D-005..D-007).
// Shared by the popup (to show the number) and the content script (to use it), so they always agree.

import type { Candidate, Level, Settings } from "@parrot/shared";

export const MAX_SWAPS = 25;
/** "Grow automatically": a starting amount plus one per solid word (known + mastered), up to MAX_SWAPS. */
export const AUTO_BASE = 5;

export function solidCount(candidates: Candidate[]): number {
  return candidates.filter((c) => c.state === "known" || c.state === "mastered").length;
}

export function autoSwaps(candidates: Candidate[]): number {
  return Math.min(MAX_SWAPS, AUTO_BASE + solidCount(candidates));
}

/** The page budget: 0 when Parrot is off, else the auto amount or the slider's perPageCap. */
export function swapBudget(settings: Settings, autoGrow: boolean, candidates: Candidate[]): number {
  if (settings.intensity === "off") return 0;
  const n = autoGrow ? autoSwaps(candidates) : settings.perPageCap;
  return Math.max(0, Math.min(MAX_SWAPS, n));
}

export const LEVEL_BAND: Record<Level, number> = { beginner: 1, intermediate: 2, upper_intermediate: 3 };
