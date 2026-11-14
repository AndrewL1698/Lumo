import { TranslateRequest, TranslateResponse, type TranslateItem } from "@parrot/shared";
import { translateBatch, type TranslateOutput } from "@/lib/claude";
import { getDb } from "@/lib/db";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// The span and inflection depend on the sentence, so cache per (lemma, match, sentence),
// not per sense. HACK: in-memory, per server process.
const cache = new Map<string, TranslateOutput>();
const keyOf = (it: { lemma: string; englishMatch: string; sentence: string }) =>
  `${it.lemma}|${it.englishMatch.toLowerCase()}|${it.sentence}`;

// Drop anything that isn't a verbatim span of the sentence containing the matched English.
function check(out: TranslateOutput, it: { sentence: string; englishMatch: string }): TranslateOutput {
  if (!out) return null;
  if (!it.sentence.includes(out.span)) return null;
  if (!out.span.toLowerCase().includes(it.englishMatch.toLowerCase())) return null;
  return out;
}

// TODO(demo): Bearer token isn't checked yet. TranslateRequest has no domain, so no never-list check here.
export async function POST(req: Request) {
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
      todo.forEach(({ it }, n) => cache.set(keyOf(it), check(outs[n], it)));
    } catch (err) {
      // Degrade: no swaps for the uncached items (not cached, so a reload retries).
      console.error("[api/translate] failed", err);
    }
  }
  console.log(`[api/translate] ${items.length} items, ${items.length - todo.length} cached`);

  const result: TranslateItem[] = items.map((it) => {
    const out = cache.get(keyOf(it));
    return out ? { span: out.span, replacement: out.replacement, lemma: it.lemma } : null;
  });
  return withCors(json({ items: result }, TranslateResponse));
}
