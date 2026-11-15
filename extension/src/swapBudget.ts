// How much Spanish a page shows (D-019, replacing D-018's two controls): ONE immersion percent, driven by what the
// learner has proven (server-side understanding points), turned into page rules. Shared by the service worker (to
// compute the percent), the popup (to show it) and the content script (to use it), so they always agree.

import type { Level, Settings } from "@parrot/shared";

/** Top of the step-0 band: up to this many words, today's one-per-sentence spacing (D-005..D-007). */
export const MAX_SWAPS = 25;

export const LEVEL_BAND: Record<Level, number> = { beginner: 1, intermediate: 2, upper_intermediate: 3 };

// ---------------------------------------------------------------- the immersion percent (D-019)

/** Percent per understanding point at 1×: 200 known words (400 points) = 100%. */
export const DIAL_K = 0.25;
/**
 * Demo speed. The scripted round is about 5 points (3 Knew it + empresa used correctly in the tutor), so from the
 * seeded ~5% this lands near 90%. TODO(demo): tune on the NPR page.
 */
export const DEMO_RATE = 70;
/** Popup speeds. 1× is the honest default; the others only compress time, and we say so. */
export const IMMERSION_RATES = [1, 10, DEMO_RATE] as const;
/** Popup "jump to" buttons: pre-warm the translate cache, and the stage fallback. */
export const IMMERSION_JUMPS = [0, 35, 70, 100] as const;

/** Kill switch for whole Spanish sentences and paragraphs. false = word swaps only at every percent. */
export const BLOCKS_ENABLED = true;

/**
 * chrome.storage.local.dial. Speed only scales gains made after it was picked: on a speed change or jump, `base`
 * becomes the current (or target) percent and `points0` the current points, so the number never jumps.
 */
export interface Dial {
  rate: number;
  /** Percent at `points0`. */
  base: number;
  /** Understanding points when `base` was set. */
  points0: number;
  /**
   * Highest percent reached since the last speed change, jump or reset. The percent never drops below it: a hover
   * sends a known word back to learning (−2 points), and at Demo speed that alone would cost about 35%.
   */
  peak: number;
  /** Last understanding points the server reported; used while the server is unreachable. */
  points: number;
}

export const DEFAULT_DIAL: Dial = { rate: 1, base: 0, points0: 0, peak: 0, points: 0 };

/** Unrounded, unclamped percent from the dial alone (no peak). */
export function dialRaw(d: Dial, points: number): number {
  return d.base + (points - d.points0) * d.rate * DIAL_K;
}

/** The percent shown and used, 0–100, never below the peak. */
export function dialPercent(d: Dial, points: number): number {
  return Math.max(0, Math.min(100, Math.round(Math.max(d.peak, dialRaw(d, points)))));
}

/** New/learning words per page at `percent`, on top of the known words (which are free): 5 at 0%, 200 at 100%. */
export function budgetFor(percent: number): number {
  return Math.round(5 + 1.95 * Math.max(0, Math.min(100, percent)));
}

// ---------------------------------------------------------------- page rules

export interface StepRules {
  step: 0 | 1 | 2 | 3;
  /** Lowest immersion % for this step's blocks. */
  from: number;
  /** Budget words per page (known words don't count against it). */
  words: number;
  /** Max budget swaps per sentence. Infinity = no limit. */
  perSentence: number;
  /** Words that must sit between two budget swaps. Step 0 uses the content script's computed gap instead. */
  minGap: number;
  /** Swap never-met words easier than the learner's level, and known_assumed ones. */
  includeEasy: boolean;
  /** Whole sentences turned Spanish. */
  sentenceBlocks: number;
  /** Whole plain <p> paragraphs turned Spanish. */
  paragraphBlocks: number;
}

/** D-018's four steps. In D-019 a step's `words` only chooses spacing; `from` only chooses blocks. */
export const STEPS: readonly StepRules[] = [
  { step: 0, from: 0, words: MAX_SWAPS, perSentence: 1, minGap: 12, includeEasy: false, sentenceBlocks: 0, paragraphBlocks: 0 },
  { step: 1, from: 20, words: 40, perSentence: 2, minGap: 5, includeEasy: true, sentenceBlocks: 0, paragraphBlocks: 0 },
  { step: 2, from: 55, words: 90, perSentence: 3, minGap: 2, includeEasy: true, sentenceBlocks: 3, paragraphBlocks: 0 },
  { step: 3, from: 85, words: 200, perSentence: Infinity, minGap: 2, includeEasy: true, sentenceBlocks: 8, paragraphBlocks: 4 },
];

/** The step whose blocks apply at `percent`. */
export function stepFor(percent: number): StepRules {
  let rules = STEPS[0]!;
  for (const s of STEPS) if (percent >= s.from) rules = s;
  if (!BLOCKS_ENABLED) rules = { ...rules, sentenceBlocks: 0, paragraphBlocks: 0 };
  return rules;
}

/**
 * The one path from percent to page rules. Lumo off = no words. Otherwise the budget is N(percent); spacing comes from
 * the first step whose word count covers N; blocks come from the step for the percent.
 */
export function pageRules(settings: Settings, percent: number): StepRules {
  if (settings.intensity === "off") return { ...STEPS[0]!, words: 0 };
  const words = budgetFor(percent);
  const spacing = STEPS.find((s) => s.words >= words) ?? STEPS[STEPS.length - 1]!;
  const blocks = stepFor(percent);
  return { ...spacing, words, sentenceBlocks: blocks.sentenceBlocks, paragraphBlocks: blocks.paragraphBlocks };
}
