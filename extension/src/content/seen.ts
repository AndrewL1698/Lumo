// `seen` events (brief 3.2): a swapped word counts as seen once it has been on screen long
// enough that the reader plausibly read it. Scrolling straight past sends nothing, which is the
// point — `seen` is weak evidence in the learner model (specs §6.1) and would be worthless if it
// fired on every scroll.
//
// Kept in its own file so it does not sit on top of the word-picking code in index.ts.

/**
 * How long a swap must stay on screen before it counts. The brief says ≥2s; 5s is deliberately
 * stricter, so a word skimmed on the way down the page does not count as read.
 */
const VISIBLE_MS = 5000;
/** Half the word on screen is enough; these are short inline spans. */
const THRESHOLD = 0.5;

/**
 * Starts watching, and returns a function to register each new swap.
 * `onSeen` fires at most once per lemma per page.
 */
export function watchSeen(onSeen: (lemma: string) => void): (el: HTMLElement) => void {
  const pending = new Map<Element, ReturnType<typeof setTimeout>>();
  const counted = new Set<string>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const lemma = el.dataset.parrotLemma;
        if (!lemma) continue;

        if (!entry.isIntersecting) {
          // Scrolled away before the two seconds were up: it was never seen.
          clearTimeout(pending.get(el));
          pending.delete(el);
          continue;
        }
        if (counted.has(lemma) || pending.has(el)) continue;

        pending.set(
          el,
          setTimeout(() => {
            pending.delete(el);
            if (counted.has(lemma)) return;
            counted.add(lemma);
            observer.unobserve(el); // one event per word, so stop watching it
            onSeen(lemma);
          }, VISIBLE_MS),
        );
      }
    },
    { threshold: THRESHOLD },
  );

  return (el: HTMLElement) => observer.observe(el);
}
