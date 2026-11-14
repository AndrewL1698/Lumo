// Remembers, in this browser only, which words just became "known" so the Vocabulary page can highlight them.
// Display-only: it never changes a word's state. Storage can be missing (private window), so everything is try/catch.
const LEARNED_KEY = "parrot.justLearned"; // { lemma: timestampMs }
const SNAPSHOT_KEY = "parrot.vocab.knownSnapshot"; // lemmas in "known" at the last Vocabulary load
const WINDOW_MS = 3 * 60 * 60 * 1000; // highlight for 3 hours

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: highlight just won't persist */
  }
}

/** Called by the tutor page when words flip to known. */
export function rememberLearned(lemmas: string[]) {
  if (!lemmas.length) return;
  const map = read<Record<string, number>>(LEARNED_KEY, {});
  for (const l of lemmas) map[l] = Date.now();
  write(LEARNED_KEY, map);
}

/** Words to highlight: flipped in the tutor recently, or newly in "known" since the last Vocabulary load. */
export function justLearned(knownNow: string[]): Set<string> {
  const out = new Set<string>();
  const map = read<Record<string, number>>(LEARNED_KEY, {});
  for (const [l, t] of Object.entries(map)) if (Date.now() - t < WINDOW_MS && knownNow.includes(l)) out.add(l);
  const prev = read<string[] | null>(SNAPSHOT_KEY, null);
  if (prev) for (const l of knownNow) if (!prev.includes(l)) out.add(l);
  return out;
}

/** Save what "known" looked like, for the next comparison. Keeps earlier highlights alive via LEARNED_KEY. */
export function saveKnownSnapshot(knownNow: string[], highlighted: Set<string>) {
  rememberLearned([...highlighted].filter((l) => !(read<Record<string, number>>(LEARNED_KEY, {})[l])));
  write(SNAPSHOT_KEY, knownNow);
}
