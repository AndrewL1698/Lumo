// How many words a page may swap, and how difficult never-met words may be (decisions D-005..D-007), plus the
// immersion dial (D-018). Shared by the popup (to show the numbers) and the content script (to use them), so they
// always agree.

import type { Candidate, Level, Settings } from "@parrot/shared";

export const MAX_SWAPS = 25;
/** The manual slider goes higher than the auto amount, for testing and the demo. Above 25 it borrows a higher
 *  step's spacing rules (words only, no Spanish blocks) so the number is actually reachable. */
export const SLIDER_MAX = 200;
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
  return Math.max(0, Math.min(autoGrow ? MAX_SWAPS : SLIDER_MAX, n));
}

export const LEVEL_BAND: Record<Level, number> = { beginner: 1, intermediate: 2, upper_intermediate: 3 };

// ---------------------------------------------------------------- immersion dial (D-018)

/** Progress points per learner event. Struggling still counts as engagement, just less. */
export const IMMERSION_POINTS = { hover: 0.5, knew_it: 2, didnt_know: 1 } as const;
/** Tune on the real page: at rate 3×, one round (4 hovers, 3 knew, 1 didn't = 9 points) is about 35%. */
export const IMMERSION_PER_POINT = 1.3;
/** Popup speed-up for a 2-minute demo. 1× is the honest default. */
export const IMMERSION_RATES = [1, 3, 5] as const;
/** Popup "jump to" buttons: pre-warm the cache, and the stage fallback. */
export const IMMERSION_JUMPS = [0, 35, 70, 100] as const;

/** Kill switch for Part B (whole Spanish sentences and paragraphs). false = word swaps only at every step. */
export const BLOCKS_ENABLED = true;

/** chrome.storage.local.immersion */
export interface Immersion {
  points: number;
  rate: number;
}

export function immersionPercent(i: Immersion): number {
  return Math.max(0, Math.min(100, Math.round(i.points * i.rate * IMMERSION_PER_POINT)));
}

/** Points that give exactly `percent` at `rate` (for the jump buttons). */
export function pointsForPercent(percent: number, rate: number): number {
  return percent / (Math.max(1, rate) * IMMERSION_PER_POINT);
}

export interface StepRules {
  step: 0 | 1 | 2 | 3;
  /** Lowest immersion % for this step. */
  from: number;
  /** Words per page. Step 0 uses today's budget (swapBudget) instead. */
  words: number;
  /** Max word swaps per sentence. Infinity = no limit. */
  perSentence: number;
  /** Words that must sit between two swaps. Step 0 keeps today's computed gap. */
  minGap: number;
  /** Swap never-met words easier than the learner's level, and known_assumed ones. */
  includeEasy: boolean;
  /** Whole sentences turned Spanish. */
  sentenceBlocks: number;
  /** Whole plain <p> paragraphs turned Spanish. */
  paragraphBlocks: number;
}

/**
 * Four fixed steps rather than a smooth curve, so picks depend on the step and not the exact point total:
 * the presenter has a wide margin per round, and pre-warming covers four configurations.
 * Step 0 is today's behaviour and runs today's code path unchanged.
 */
export const STEPS: readonly StepRules[] = [
  { step: 0, from: 0, words: MAX_SWAPS, perSentence: 1, minGap: 12, includeEasy: false, sentenceBlocks: 0, paragraphBlocks: 0 },
  { step: 1, from: 20, words: 40, perSentence: 2, minGap: 5, includeEasy: true, sentenceBlocks: 0, paragraphBlocks: 0 },
  { step: 2, from: 55, words: 90, perSentence: 3, minGap: 2, includeEasy: true, sentenceBlocks: 3, paragraphBlocks: 0 },
  { step: 3, from: 85, words: 200, perSentence: Infinity, minGap: 2, includeEasy: true, sentenceBlocks: 8, paragraphBlocks: 4 },
];

export function stepFor(percent: number): StepRules {
  let rules = STEPS[0]!;
  for (const s of STEPS) if (percent >= s.from) rules = s;
  if (!BLOCKS_ENABLED) rules = { ...rules, sentenceBlocks: 0, paragraphBlocks: 0 };
  return rules;
}

/**
 * The rules a page uses. Parrot off = step 0 with no words. "Grow automatically" off = the manual slider (0–200,
 * spacing from the lowest step that fits the number, no blocks). Otherwise the immersion dial picks the step.
 */
export function pageRules(settings: Settings, autoGrow: boolean, immersion: Immersion, candidates: Candidate[]): StepRules {
  if (settings.intensity === "off") return { ...STEPS[0]!, words: 0 };
  if (!autoGrow) {
    // Slider: the lowest step whose word count covers the number, words only.
    const words = swapBudget(settings, autoGrow, candidates);
    const base = STEPS.find((s) => s.words >= words) ?? STEPS[STEPS.length - 1]!;
    return { ...base, words, sentenceBlocks: 0, paragraphBlocks: 0 };
  }
  const rules = stepFor(immersionPercent(immersion));
  if (rules.step === 0) return { ...rules, words: swapBudget(settings, autoGrow, candidates) };
  return rules;
}
