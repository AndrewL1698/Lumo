// Step 1: download the Spanish frequency list and keep the top TARGET_FORMS forms.
// Source: hermitdave/FrequencyWords, OpenSubtitles 2018 — CC-BY-SA 4.0 (attribution in scripts/README.md).
import { join } from "node:path";
import { OUT, TARGET_FORMS, has, readJson, writeJson, type FormRow } from "./lib.ts";

const URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt";
export const FORMS_PATH = join(OUT, "forms.json");

export async function fetchForms(): Promise<FormRow[]> {
  if (has(FORMS_PATH)) return readJson<FormRow[]>(FORMS_PATH);

  const res = await fetch(URL);
  if (!res.ok) throw new Error(`frequency list download failed: ${res.status}`);
  const lines = (await res.text()).split("\n");

  // Each line is "<word> <count>", already sorted by frequency.
  const forms: FormRow[] = [];
  for (const line of lines) {
    const word = line.trim().split(/\s+/)[0]?.toLowerCase();
    if (!word) continue;
    forms.push({ form: word, rank: forms.length + 1 });
    if (forms.length >= TARGET_FORMS) break;
  }
  writeJson(FORMS_PATH, forms);
  console.log(`fetch: kept ${forms.length} forms`);
  return forms;
}
