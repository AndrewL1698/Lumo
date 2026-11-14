// Word-list build: fetch → filter → enrich (Haiku) → merge → wordindex.json → seed Supabase.
//   npm run build-wordlist -w scripts                  full run
//   npm run build-wordlist:sample -w scripts           first 2 batches, no seed (sanity check)
// Flags: --batches N (only enrich the first N batches), --no-seed
import { fetchForms } from "./fetch.ts";
import { filterForms } from "./filter.ts";
import { enrichForms } from "./enrich.ts";
import { mergeItems } from "./merge.ts";
import { emitIndex } from "./index-emit.ts";
import { seedWords } from "./seed.ts";

const args = process.argv.slice(2);
const batchesArg = args.indexOf("--batches");
const maxBatches = batchesArg >= 0 ? Number(args[batchesArg + 1]) : Infinity;
const seed = !args.includes("--no-seed");

const forms = filterForms(await fetchForms());
const items = await enrichForms(forms, maxBatches);
const words = mergeItems(items);
emitIndex(words);
if (seed) await seedWords(words);
else console.log("seed: skipped (--no-seed)");
