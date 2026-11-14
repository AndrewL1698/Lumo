// Step 7 (Phase 1): second Haiku pass over nouns + false friends. Writes only disagreements to
// out/audit.json for manual review. Fix words.json by hand, then `npm run seed-words -w scripts`.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { join } from "node:path";
import { HAIKU, OUT, readJson, writeJson, type WordRow } from "./lib.ts";
import { WORDS_PATH } from "./merge.ts";

const Verdict = z.object({
  lemma: z.string(),
  ok: z.boolean(),
  gender: z.enum(["m", "f"]).nullable(),
  article: z.enum(["el", "la"]).nullable(),
  false_friend: z.boolean(),
  note: z.string(),
});
const Result = z.object({ items: z.array(Verdict) });

const SYSTEM = `You are checking a Latin American Spanish vocabulary list for English-speaking learners.
For each row, check the noun's gender and singular definite article ("el agua" is gender f, article el),
and whether the word is a false friend (looks like an English word but means something different).
Return one item per row. ok = true only if gender, article and false_friend are all correct as given.
Always return the correct values. note: one short English sentence explaining any problem, else "".`;

export async function auditWords() {
  const words = readJson<WordRow[]>(WORDS_PATH);
  const rows = words.filter((w) => w.pos === "noun" || w.false_friend);
  const client = new Anthropic();
  const flagged: unknown[] = [];

  for (let i = 0; i < rows.length; i += 150) {
    const chunk = rows.slice(i, i + 150);
    const input = chunk.map((w) => `${w.lemma} | gender=${w.gender} article=${w.article} false_friend=${w.false_friend} | ${w.english.join(", ")}`).join("\n");
    const res = await client.messages.parse({
      model: HAIKU,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Result) },
      messages: [{ role: "user", content: input }],
    });
    if (!res.parsed_output) { console.error(`audit: chunk ${i} failed (stop_reason=${res.stop_reason})`); continue; }
    const byLemma = new Map(chunk.map((w) => [w.lemma, w]));
    for (const v of res.parsed_output.items) {
      const w = byLemma.get(v.lemma);
      if (!w) continue;
      const differs = (w.pos === "noun" && (v.gender !== w.gender || v.article !== w.article)) || v.false_friend !== w.false_friend;
      if (!v.ok || differs) {
        flagged.push({ lemma: w.lemma, current: { gender: w.gender, article: w.article, false_friend: w.false_friend }, suggested: { gender: v.gender, article: v.article, false_friend: v.false_friend }, note: v.note });
      }
    }
    console.log(`audit: checked ${Math.min(i + 150, rows.length)}/${rows.length}`);
  }
  writeJson(join(OUT, "audit.json"), flagged);
  console.log(`audit: ${flagged.length} rows flagged → out/audit.json`);
}

await auditWords();
