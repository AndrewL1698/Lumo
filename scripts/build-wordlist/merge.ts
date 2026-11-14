// Step 4: drop "other", dedupe by lemma (best source rank wins), renumber, keep top TARGET_LEMMAS, band.
import { join } from "node:path";
import { OUT, TARGET_LEMMAS, bandFor, writeJson, type WordRow } from "./lib.ts";
import type { EnrichedItem } from "./enrich.ts";

export const WORDS_PATH = join(OUT, "words.json");

const lower = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function mergeItems(items: EnrichedItem[]): WordRow[] {
  const byLemma = new Map<string, { best: EnrichedItem; forms: Set<string> }>();
  for (const item of [...items].sort((a, b) => a.rank - b.rank)) {
    if (item.pos === "other") continue;
    const lemma = item.lemma.trim().toLowerCase();
    if (!lemma) continue;
    const entry = byLemma.get(lemma);
    if (!entry) byLemma.set(lemma, { best: item, forms: new Set(item.english_forms) });
    // Other inflections of the same lemma only contribute extra English forms of the same POS.
    else if (item.pos === entry.best.pos) item.english_forms.forEach((f) => entry.forms.add(f));
  }

  let dropped = 0;
  const rows: WordRow[] = [];
  for (const [lemma, { best, forms }] of byLemma) {
    if (best.pos === "other") continue;
    const isNoun = best.pos === "noun";
    let gender = isNoun ? best.gender : null;
    let article = isNoun ? best.article : null;
    if (isNoun && gender && !article) article = gender === "f" ? "la" : "el";
    if (isNoun && !gender && article) gender = article === "la" ? "f" : "m"; // "el agua" stays f via Haiku
    if (isNoun && (!gender || !article)) { dropped++; continue; } // nouns must teach their article
    const english = lower(best.english);
    const english_forms = lower([...english, ...forms]);
    if (!english.length) { dropped++; continue; }
    rows.push({
      lemma, rank: best.rank, pos: best.pos, gender, article, english, english_forms,
      cognate: best.cognate, false_friend: best.false_friend, band: 1,
    });
  }

  rows.sort((a, b) => a.rank - b.rank);
  const words = rows.slice(0, TARGET_LEMMAS).map((r, i) => ({ ...r, rank: i + 1, band: bandFor(i + 1) }));
  writeJson(WORDS_PATH, words);
  const nouns = words.filter((w) => w.pos === "noun").length;
  console.log(`merge: ${words.length} lemmas (${nouns} nouns), dropped ${dropped} incomplete rows`);
  if (words.length < TARGET_LEMMAS) console.warn(`merge: fewer than ${TARGET_LEMMAS} lemmas; raise TARGET_FORMS in lib.ts`);
  return words;
}
