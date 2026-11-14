// Step 6: upsert out/words.json into Supabase `words` via PostgREST (plain fetch, no supabase-js).
// Run alone with `npm run seed-words -w scripts` after editing words.json by hand.
import { fileURLToPath } from "node:url";
import { readJson, type WordRow } from "./lib.ts";
import { WORDS_PATH } from "./merge.ts";

export async function seedWords(words: WordRow[]) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing (web/.env.local)");

  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys must not.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  for (let i = 0; i < words.length; i += 500) {
    const chunk = words.slice(i, i + 500);
    const res = await fetch(`${url}/rest/v1/words?on_conflict=lemma`, {
      method: "POST", headers, body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`seed failed at row ${i}: ${res.status} ${await res.text()}`);
  }
  console.log(`seed: upserted ${words.length} rows into words`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await seedWords(readJson<WordRow[]>(WORDS_PATH));
}
