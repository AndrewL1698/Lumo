// Step 5: inverted index for the extension: English surface form → Spanish lemmas (most frequent first).
// Written into Naren's folder (extension/src/wordindex.json); it's a generated file — don't hand-edit.
import { WORDINDEX_PATH, writeJson, type WordRow } from "./lib.ts";

export function emitIndex(words: WordRow[]) {
  const index: Record<string, string[]> = {};
  for (const w of [...words].sort((a, b) => a.rank - b.rank)) {
    for (const form of w.english_forms) {
      // Only single-token forms: the content script matches one English token at a time.
      if (!/^[a-z]+(?:'[a-z]+)?$/.test(form)) continue;
      (index[form] ??= []).includes(w.lemma) || index[form].push(w.lemma);
    }
  }
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(WORDINDEX_PATH, sorted);
  console.log(`index: ${Object.keys(sorted).length} English forms → ${WORDINDEX_PATH}`);
}
