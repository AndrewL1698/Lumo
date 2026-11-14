// Check candidate words for a demo page: are they in the word list, which band, cognate (the tutor skips those)?
//   npm run check-words -w scripts -- inflation price rate economía dinero
// Accepts English words (looked up via extension/src/wordindex.json) or Spanish lemmas. Needs web/.env.local.
import "./build-wordlist/lib.ts"; // loads web/.env.local
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const index: Record<string, string[]> = JSON.parse(readFileSync(join(here, "../extension/src/wordindex.json"), "utf8"));
const inputs = process.argv.slice(2).map((w) => w.toLowerCase());
if (!inputs.length) throw new Error("usage: npm run check-words -w scripts -- word1 word2 …");

// English form → lemmas from the index; anything else is treated as a lemma.
const lemmasFor = new Map(inputs.map((w) => [w, index[w] ?? [w]]));
const all = [...new Set([...lemmasFor.values()].flat())];

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing (web/.env.local)");
const headers: Record<string, string> = { apikey: key };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
const list = encodeURIComponent(`(${all.map((l) => `"${l}"`).join(",")})`);
const res = await fetch(`${url}/rest/v1/words?select=lemma,band,pos,article,english,cognate,false_friend&lemma=in.${list}`, { headers });
if (!res.ok) throw new Error(`words query failed: ${res.status} ${await res.text()}`);
type Row = { lemma: string; band: number; pos: string; article: string | null; english: string[]; cognate: boolean; false_friend: boolean };
const rows = new Map(((await res.json()) as Row[]).map((r) => [r.lemma, r]));

const BAND = ["", "beginner", "intermediate", "upper_int"];
for (const [input, lemmas] of lemmasFor) {
  for (const lemma of lemmas) {
    const r = rows.get(lemma);
    if (!r) {
      console.log(`✗ ${input.padEnd(14)} not in the word list (no swap, no tutor target)`);
      continue;
    }
    const usable = !r.cognate; // Andrew's target picker skips cognates only
    console.log(
      `${usable ? "✓" : "~"} ${input.padEnd(14)} → ${(r.article ? `${r.article} ` : "") + r.lemma}`.padEnd(36) +
        ` ${BAND[r.band].padEnd(10)} ${r.pos.padEnd(4)} ${r.cognate ? "cognate (tutor skips)" : ""}${r.false_friend ? " false friend (hover card warns)" : ""}  [${r.english.join(", ")}]`,
    );
  }
}
console.log("\n✓ usable for swaps + tutor   ~ swaps only (cognate: tutor skips it)   ✗ not in list");
