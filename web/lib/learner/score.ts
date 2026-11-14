// Candidate scoring for swaps (docs/specs.md §5.2). Server builds the flags for /api/candidates;
// the extension (or server) scores and picks with the 70/30 review/new mix.
import { isDue } from "./applyEvent";
import type { UserWord } from "./types";

export type Candidate = {
  lemma: string;
  state: UserWord["state"];
  isDue: boolean;
  hoveredRecently: boolean;
  onWeakList: boolean;
  isNewInBand: boolean;
  isMastered: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function toCandidate(
  word: UserWord,
  opts: { wordBand: number; userBand: number; weakList: ReadonlySet<string>; now: Date },
): Candidate {
  const { wordBand, userBand, weakList, now } = opts;
  // specs §4: words in bands below the user's level count as known_assumed, unless there's real evidence
  // (any hover/review moves them past new/seen). Computed on read only, never written.
  const assumed = (word.state === "new" || word.state === "seen") && wordBand < userBand;
  return {
    lemma: word.lemma,
    state: assumed ? "known_assumed" : word.state,
    isDue: isDue(word, now),
    hoveredRecently: word.lastHoverAt !== null && now.getTime() - new Date(word.lastHoverAt).getTime() <= WEEK_MS,
    onWeakList: weakList.has(word.lemma),
    isNewInBand: word.state === "new" && wordBand === userBand, // brief 3.1: state `new` only
    isMastered: word.state === "mastered",
  };
}

export function score(c: Candidate, rand: () => number = Math.random): number {
  return (
    3.0 * +c.isDue +
    2.0 * +c.hoveredRecently +
    1.5 * +c.onWeakList +
    1.0 * +c.isNewInBand -
    5.0 * +c.isMastered +
    rand() * 0.3 // small jitter so the same words don't always win
    // TODO(demo): + 0.5 * matches_topic_pack (stretch)
  );
}

const isNewish = (c: Candidate) => c.state === "new" || c.state === "seen";

// Pick up to n lemmas: ~70% review/learning words, ~30% new, each group by descending score.
// If one group runs short, the other fills the gap.
export function pickMix(candidates: Candidate[], n: number, rand: () => number = Math.random): string[] {
  const ranked = candidates.map((c) => ({ c, s: score(c, rand) })).sort((a, b) => b.s - a.s);
  const review = ranked.filter((r) => !isNewish(r.c));
  const fresh = ranked.filter((r) => isNewish(r.c));
  const wantReview = Math.round(n * 0.7);
  const takeReview = Math.min(review.length, Math.max(wantReview, n - fresh.length));
  const takeFresh = Math.min(fresh.length, n - takeReview);
  return [...review.slice(0, takeReview), ...fresh.slice(0, takeFresh)].map((r) => r.c.lemma);
}
