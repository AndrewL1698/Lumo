import { TranslateRequest, TranslateResponse, type TranslateItem } from "@parrot/shared";
import { cleanSwap, translateBatch, type TranslateOutput } from "@/lib/claude";
import { checkExtensionToken } from "@/lib/auth";
import { errText, getDb } from "@/lib/db";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const OPTIONS = preflight;

// The span and inflection depend on the sentence, so cache per (lemma, match, sentence),
// not per sense. HACK: in-memory, saved to a file in the OS temp folder so a server restart doesn't make the next
// page load slow again (outside the repo, so nothing to commit). Open the demo page once before judging to warm it.
const CACHE_FILE = join(tmpdir(), "parrot-translate-cache.json");
const cache = new Map<string, TranslateOutput>(loadCache());

function loadCache(): [string, TranslateOutput][] {
  try {
    return Object.entries(JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<string, TranslateOutput>);
  } catch {
    return []; // no file yet, or unreadable: start empty
  }
}

function saveCache(): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache)));
  } catch (err) {
    console.warn("[api/translate] could not save cache:", errText(err));
  }
}
const keyOf = (it: { lemma: string; englishMatch: string; sentence: string }) =>
  `${it.lemma}|${it.englishMatch.toLowerCase()}|${it.sentence}`;

// Drop anything that isn't a verbatim span of the sentence containing the matched English.
function check(out: TranslateOutput, it: { sentence: string; englishMatch: string }): TranslateOutput {
  if (!out) return null;
  if (!it.sentence.includes(out.span)) return null;
  if (!out.span.toLowerCase().includes(it.englishMatch.toLowerCase())) return null;
  return out;
}

// TranslateRequest has no domain, so no never-list check here.
export async function POST(req: Request) {
  const denied = checkExtensionToken(req);
  if (denied) return denied;
  const body = await parseBody(req, TranslateRequest);
  if (body instanceof NextResponse) return withCors(body);
  const { items } = body;

  const todo = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !cache.has(keyOf(it)));
  if (todo.length) {
    try {
      const lemmas = [...new Set(todo.map(({ it }) => it.lemma))];
      const { data } = await getDb().from("words").select("lemma, english").in("lemma", lemmas);
      const senses = new Map((data ?? []).map((w) => [w.lemma as string, w.english as string[]]));
      const outs = await translateBatch(todo.map(({ it }) => ({ ...it, senses: senses.get(it.lemma) })));
      // undefined = that group's call failed: leave it uncached so a reload retries it.
      todo.forEach(({ it }, n) => {
        const out = outs[n];
        if (out !== undefined) cache.set(keyOf(it), check(out, it));
      });
      saveCache();
    } catch (err) {
      // Degrade: no swaps for the uncached items (not cached, so a reload retries).
      console.error("[api/translate] failed:", errText(err));
    }
  }
  console.log(`[api/translate] ${items.length} items, ${items.length - todo.length} cached`);

  const result: TranslateItem[] = items.map((it) => {
    const out = cache.get(keyOf(it));
    // cleanSwap runs when serving, so it also fixes swaps cached before it existed (D-018 update).
    const replacement = out ? cleanSwap(it.lemma, out.span, out.replacement) : null;
    return out && replacement ? { span: out.span, replacement, lemma: it.lemma } : null;
  });
  return withCors(json({ items: result }, TranslateResponse));
}
