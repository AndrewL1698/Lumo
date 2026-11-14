// Step 3: Haiku lemmatizes + classifies forms in batches (structured outputs, effort low).
// Each batch is cached to out/batches/NNN.json, so reruns only call Claude for missing batches.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { join } from "node:path";
import { BATCH_DIR, HAIKU, has, readJson, writeJson, type FormRow } from "./lib.ts";

const BATCH_SIZE = 100;
const CONCURRENCY = 5;

const Item = z.object({
  form: z.string(),
  lemma: z.string(),
  pos: z.enum(["noun", "verb", "adj", "adv", "other"]),
  gender: z.enum(["m", "f"]).nullable(),
  article: z.enum(["el", "la"]).nullable(),
  english: z.array(z.string()),
  english_forms: z.array(z.string()),
  cognate: z.boolean(),
  false_friend: z.boolean(),
});
const Batch = z.object({ items: z.array(Item) });

export type EnrichedItem = z.infer<typeof Item> & { rank: number };

const SYSTEM = `You build a vocabulary list for English speakers learning Latin American Spanish.
For every Spanish word form you are given, return exactly one item, with "form" copied exactly as given.

- lemma: dictionary form (tengo → tener, casas → casa, buenas → bueno). Lowercase.
- pos: the word's most common use: noun, verb, adj or adv. Use "other" for function words,
  interjections, proper names, numbers, abbreviations, non-Spanish words, and anything that is not a
  useful content word for a learner.
- gender and article: nouns only, otherwise null. Article is the singular definite article actually
  used with the lemma, so "el agua" (gender f, article el), "el problema" (m, el), "la mano" (f, la).
- english: 1–3 common English meanings, most common first, lowercase.
- english_forms: every English surface form a reader could see on a web page for those meanings,
  lowercase. Nouns: singular and plural ("house","houses","home","homes"). Verbs: base, 3rd person,
  past, past participle, -ing ("eat","eats","ate","eaten","eating"). Adjectives/adverbs: base form.
- cognate: true if the lemma looks like an English word with the same meaning (información, animal).
- false_friend: true if the lemma looks like an English word with a different meaning
  (embarazada, actual, librería, éxito, carpeta).
Use Latin American usage where meanings differ by region.`;

let client: Anthropic | undefined;

async function enrichBatch(forms: FormRow[]): Promise<EnrichedItem[]> {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model: HAIKU,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(Batch) },
    messages: [{ role: "user", content: forms.map((f) => f.form).join("\n") }],
  });
  if (res.stop_reason !== "end_turn" || !res.parsed_output) {
    throw new Error(`stop_reason=${res.stop_reason}`);
  }
  // Re-attach source ranks by form; ignore anything the model invented.
  const rankOf = new Map(forms.map((f) => [f.form, f.rank]));
  return res.parsed_output.items
    .filter((i) => rankOf.has(i.form))
    .map((i) => ({ ...i, rank: rankOf.get(i.form)! }));
}

/** Enrich all forms (or only the first `maxBatches` batches). Returns every cached item so far. */
export async function enrichForms(forms: FormRow[], maxBatches = Infinity): Promise<EnrichedItem[]> {
  const batches: FormRow[][] = [];
  for (let i = 0; i < forms.length; i += BATCH_SIZE) batches.push(forms.slice(i, i + BATCH_SIZE));
  const todo = batches.slice(0, maxBatches).map((b, n) => ({ b, path: join(BATCH_DIR, `${String(n).padStart(3, "0")}.json`) }));

  const pending = todo.filter((t) => !has(t.path));
  console.log(`enrich: ${todo.length - pending.length}/${todo.length} batches cached, ${pending.length} to run`);

  let failed = 0;
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          const items = await enrichBatch(t.b);
          writeJson(t.path, items);
          console.log(`  ${t.path.slice(-8)}: ${items.length}/${t.b.length} items`);
        } catch (err) {
          failed++;
          console.error(`  ${t.path.slice(-8)} failed: ${(err as Error).message} (rerun to retry)`);
        }
      }
    }),
  );
  if (failed) console.warn(`enrich: ${failed} batch(es) failed; rerun the script to retry just those`);

  return todo.filter((t) => has(t.path)).flatMap((t) => readJson<EnrichedItem[]>(t.path));
}
