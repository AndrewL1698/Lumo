// Spanish text -> mouth shapes (visemes) for Lumo's lip-sync. Hand-written rules, no library.
// Each segment has a weight (vowels longer than consonants, pauses at punctuation); a clip's real
// duration is spread across the total weight.

export type Viseme = "rest" | "mbp" | "fv" | "a" | "ei" | "ou" | "ltn";
export type Seg = { v: Viseme; w: number; stress: boolean; char: number };
export type Track = { segs: Seg[]; starts: number[]; total: number };

/** Milliseconds per weight unit when we have to estimate timing (no audio duration). */
export const MS_PER_UNIT = 62;

// Mouth geometry per viseme, in SVG units around the mouth centre (60, 72).
// w = half-width, h = opening, curve = smile depth, teeth = top teeth on lip (F/V), round = "o" lift.
export type Shape = { w: number; h: number; curve: number; teeth: number; round: number };
export const SHAPES: Record<Viseme, Shape> = {
  rest: { w: 6, h: 0, curve: 5, teeth: 0, round: 0 },
  mbp: { w: 5.4, h: 0, curve: 0.8, teeth: 0, round: 0 },
  fv: { w: 5.6, h: 2.4, curve: 1, teeth: 1, round: 0 },
  a: { w: 7.4, h: 8, curve: 1.2, teeth: 0, round: 0 },
  ei: { w: 8.6, h: 3.4, curve: 2.4, teeth: 0.4, round: 0 },
  ou: { w: 3.9, h: 5.4, curve: 0, teeth: 0, round: 1 },
  ltn: { w: 6.2, h: 2.2, curve: 1, teeth: 0.3, round: 0 },
};

const VOWEL = /[aeiouáéíóúü]/;
const ACCENTED = /[áéíóú]/;
const LETTER = /[a-záéíóúüñ]/;

function vowelViseme(c: string): Viseme {
  if ("aá".includes(c)) return "a";
  if ("eéií".includes(c)) return "ei";
  return "ou";
}

/** Index (into s) of the stressed vowel of the word s[from..to). Spanish default stress rules. */
function stressedVowel(s: string, from: number, to: number): number {
  const nuclei: number[] = []; // first vowel of each vowel group
  for (let i = from; i < to; i++) {
    if (ACCENTED.test(s[i])) return i;
    if (VOWEL.test(s[i]) && !(i > from && VOWEL.test(s[i - 1]))) nuclei.push(i);
  }
  if (nuclei.length === 0 || (nuclei.length === 1 && to - from <= 3)) return -1; // short function words: unstressed
  const last = s[to - 1];
  const penult = /[aeiouns]/.test(last);
  return nuclei[Math.max(0, nuclei.length - (penult ? 2 : 1))];
}

export function textToSegs(text: string): Seg[] {
  const s = text.toLowerCase();
  // stressed vowel positions
  const stress = new Set<number>();
  for (let i = 0; i < s.length; ) {
    if (!LETTER.test(s[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < s.length && LETTER.test(s[j])) j++;
    const v = stressedVowel(s, i, j);
    if (v >= 0) stress.add(v);
    i = j;
  }

  const segs: Seg[] = [];
  const push = (v: Viseme, w: number, char: number, st = false) => segs.push({ v, w, stress: st, char });
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1] ?? "";
    if (VOWEL.test(c)) {
      const st = stress.has(i);
      push(vowelViseme(c), st ? 2.6 : 1.8, i, st);
    } else if (",;:".includes(c)) push("rest", 2.5, i);
    else if (".?!…".includes(c)) push("rest", 4, i);
    else if (c === "h") continue; // silent h ("ch" is handled at the c)
    else if (c === "c" && next === "h") {
      push("ltn", 1, i);
      i++;
    } else if (c === "l" && next === "l") {
      push("ei", 1.2, i); // "ll" sounds like a y: lips spread
      i++;
    } else if (c === "r" && next === "r") {
      push("ltn", 1.4, i);
      i++;
    } else if (c === "r") push("ltn", 0.8, i);
    else if (c === "q" && next === "u") {
      push("ltn", 0.9, i); // "qu" = k, the u is silent
      i++;
    } else if (c === "g" && next === "u" && /[eéií]/.test(s[i + 2] ?? "")) {
      push("ltn", 0.9, i); // "gue/gui": silent u
      i++;
    } else if (c === "y") {
      if (VOWEL.test(next)) push("ei", 1, i); // consonant y
      else push("ei", 1.6, i, false); // "y" / "hoy" / "muy": the vowel i
    } else if ("mbpv".includes(c)) push("mbp", 1, i); // Spanish v is said like b
    else if (c === "f") push("fv", 1, i);
    else if (LETTER.test(c) || /[0-9]/.test(c)) push("ltn", 0.9, i);
    // spaces, ¿ ¡ and quotes: no segment (words run together in speech)
  }
  return segs;
}

const cache = new Map<string, Track>();
export function trackFor(text: string): Track {
  let t = cache.get(text);
  if (!t) {
    const segs = textToSegs(text);
    const starts: number[] = [];
    let total = 0;
    for (const s of segs) {
      starts.push(total);
      total += s.w;
    }
    t = { segs, starts, total };
    if (cache.size > 200) cache.clear();
    cache.set(text, t);
  }
  return t;
}

/** Segment index at a position measured in weight units (-1 past the end). */
export function segAt(track: Track, units: number): number {
  if (units < 0 || units >= track.total) return -1;
  let lo = 0;
  let hi = track.segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track.starts[mid] <= units) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Weight units before a character index (for browser-voice word boundaries). */
export function unitsBeforeChar(track: Track, char: number): number {
  for (let i = 0; i < track.segs.length; i++) if (track.segs[i].char >= char) return track.starts[i];
  return track.total;
}
