// Shared paths, env loading and JSON cache helpers for the word-list build.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS } from "../../web/lib/config.ts";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");
export const OUT = join(HERE, "out");
export const BATCH_DIR = join(OUT, "batches");
export const WORDINDEX_PATH = join(REPO, "extension", "src", "wordindex.json");

// Model ID comes from the one config constant (web/lib/config.ts).
export const HAIKU = MODELS.correction;

// Inflected forms pulled from the frequency list. Verb inflections collapse heavily (está/estoy/estaba → estar),
// so we need ~3x the forms to end up with TARGET_LEMMAS lemmas.
export const TARGET_FORMS = 10000;
export const TARGET_LEMMAS = 3000; // rows that end up in `words`

// Load web/.env.local if present (Supabase keys, ANTHROPIC_API_KEY). Missing is fine until seeding.
const envFile = join(REPO, "web", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export const has = existsSync;

export type FormRow = { form: string; rank: number };

export type Pos = "noun" | "verb" | "adj" | "adv";

// One row of the `words` table (web/db/schema.sql).
export type WordRow = {
  lemma: string;
  rank: number;
  pos: Pos;
  gender: "m" | "f" | null;
  article: string | null;
  english: string[];
  english_forms: string[];
  cognate: boolean;
  false_friend: boolean;
  band: 1 | 2 | 3;
};

export function bandFor(rank: number): 1 | 2 | 3 {
  return rank <= 500 ? 1 : rank <= 1500 ? 2 : 3;
}
