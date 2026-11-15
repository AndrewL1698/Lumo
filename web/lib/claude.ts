/**
 * The ONLY module that imports @anthropic-ai/sdk.
 * Direct Anthropic API only; keep the provider swappable here so routes never touch the SDK.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SpokenErrorType } from "@parrot/shared";
import type { Level, TargetWord } from "@parrot/shared";
import { z } from "zod";
import { CLAUDE_FALLBACKS, MODELS } from "./config";
import { buildCorrectorPrompt, RECAP_SYSTEM } from "./tutor/prompts";
import type { ModelCorrection } from "./tutor/types";

/** Thrown by either lane when the model returns stop_reason "refusal". */
export class ClaudeRefusalError extends Error {}

let client: Anthropic | undefined;

/** Constructed on first use so a missing ANTHROPIC_API_KEY never breaks the build. */
export function getClaude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/**
 * What Haiku returns (voice-plan §5a) = ModelCorrection. No numeric min/max: structured outputs
 * don't support them, so validate.ts checks the ranges.
 */
const ModelCorrectionSchema = z.object({
  errors: z.array(
    z.object({
      span: z.string(),
      type: SpokenErrorType,
      correction: z.string(),
      explanation_en: z.string(),
      severity: z.number(),
      confidence: z.number(),
      lemma: z.string().nullable(),
    }),
  ),
  target_words_used: z.array(
    z.object({ lemma: z.string(), form: z.string(), correct: z.boolean() }),
  ),
  overall_ok: z.boolean(),
  // Last, and never called "ok": asked for first, it made Haiku miss real errors on the eval set.
  answer: z.enum(["answered", "english", "off_topic", "unclear"]),
  spanish_version: z.string().nullable(),
});

/** Correction lane: Haiku, thinking off, structured output. The raw transcript is passed through untouched. */
export async function correctUtterance(args: {
  rawText: string;
  level: Level;
  targetWords: TargetWord[];
  tutorPrevious?: string;
  signal?: AbortSignal;
}): Promise<ModelCorrection> {
  const { signal, ...promptArgs } = args;
  const { system, user } = buildCorrectorPrompt(promptArgs);
  const once = async (s: AbortSignal): Promise<ModelCorrection> => {
    const response = await getClaude().messages.parse(
      {
        model: MODELS.correction,
        max_tokens: 1024,
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: zodOutputFormat(ModelCorrectionSchema) },
        // The system prompt only varies by level (~900 tokens; Haiku 5.5 caches from 512), so cache it.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { signal: s },
    );
    if (response.stop_reason === "refusal") throw new ClaudeRefusalError("corrector refused");
    if (response.parsed_output === null) {
      throw new Error(`corrector returned no parsable output (stop_reason: ${response.stop_reason})`);
    }
    return response.parsed_output;
  };

  // HACK(latency): hedged request. Haiku's slow turns are random first-token and generation spikes, so two
  // identical calls race and the first valid answer wins; the other is aborted. About $0.0002 extra per turn.
  const racers = [new AbortController(), new AbortController()];
  const stopAll = () => racers.forEach((c) => c.abort());
  if (signal?.aborted) stopAll();
  else signal?.addEventListener("abort", stopAll, { once: true });
  try {
    return await Promise.any(racers.map((c) => once(c.signal)));
  } catch (err) {
    throw err instanceof AggregateError ? err.errors[0] : err; // both failed: report the first reason
  } finally {
    stopAll();
    signal?.removeEventListener("abort", stopAll);
  }
}

/** One tiny call so the structured-output schema is compiled before the first real turn. Never throws. */
export async function warmUpCorrector(): Promise<void> {
  try {
    await correctUtterance({ rawText: "hola", level: "beginner", targetWords: [] });
  } catch {
    // Warm-up only; the real call reports its own errors.
  }
}

const TUTOR_TRANSLATE_SYSTEM = `The text in <line> is one thing a Spanish tutor said out loud to a learner. Translate it into plain, natural English for someone who speaks no Spanish.
When the tutor gives the learner a Spanish word or phrase to say (after words like "Puedes decir", "Se dice" or "Puedes empezar con"), keep that phrase in Spanish and add its English in brackets, for example: You can say "Me llamo Ana" (My name is Ana). Translate everything else, questions included.
Reply with the translation only, with no quotation marks around it.`;

/** English for one finished tutor line (shown under the bubble). Haiku, plain text. Throws on any failure. */
export async function translateTutorLine(text: string, signal?: AbortSignal): Promise<string> {
  const response = await getClaude().messages.create(
    {
      model: MODELS.correction,
      max_tokens: 300,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: TUTOR_TRANSLATE_SYSTEM,
      messages: [{ role: "user", content: `<line>${text}</line>` }],
    },
    { signal },
  );
  if (response.stop_reason === "refusal") throw new ClaudeRefusalError("translator refused");
  const english = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!english) throw new Error(`translator returned no text (stop_reason: ${response.stop_reason})`);
  return english;
}

/** Conversation lane: Sonnet, streaming text deltas. Throws ClaudeRefusalError after the stream on a refusal. */
export async function* streamTutorReply(args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  const params = {
    model: MODELS.conversation,
    max_tokens: 300,
    thinking: { type: "between_tools" as const },
    output_config: { effort: "low" as const },
    // System prompt + <session> block is fixed for a session: cache it (Sonnet 5.5 caches from 512 tokens).
    // No history marker: the last user turn carries the directive and is replayed as plain text next turn,
    // so an entry written there would never be read.
    system: [{ type: "text" as const, text: args.system, cache_control: { type: "ephemeral" as const } }],
    messages: args.messages,
  };
  const options = { signal: args.signal };
  const stream = CLAUDE_FALLBACKS
    ? getClaude().beta.messages.stream(
        { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
        options,
      )
    : getClaude().messages.stream(params, options);

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta")
      yield event.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new ClaudeRefusalError("tutor refused");
}

const RecapProseSchema = z.object({ summary_en: z.string(), tips: z.array(z.string()) });

/** End-of-session recap prose: Haiku, thinking off, structured output. `user` is buildRecapUserMessage's output. */
export async function writeRecap(
  user: string,
  signal?: AbortSignal,
): Promise<{ summary_en: string; tips: string[] }> {
  const response = await getClaude().messages.parse(
    {
      model: MODELS.correction,
      max_tokens: 600,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(RecapProseSchema) },
      system: RECAP_SYSTEM,
      messages: [{ role: "user", content: user }],
    },
    { signal },
  );
  if (response.stop_reason === "refusal") throw new ClaudeRefusalError("recap refused");
  if (response.parsed_output === null) {
    throw new Error(`recap returned no parsable output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

// ---- In-context translate (/api/translate) — owner: Karthik ----

const TranslateOut = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      match: z.boolean(),
      span: z.string(),
      replacement: z.string(),
    }),
  ),
});

const TRANSLATE_SYSTEM = `You swap one English word in a sentence for its Latin American Spanish equivalent, for a language learner reading an English page.
For each item you get: i, sentence, lemma (Spanish dictionary form), englishMatch (the English word(s) found in the sentence), and senses (the English meanings of the lemma).
Return one result per item with the same i:
- match: false if englishMatch in this sentence does not carry one of the lemma's senses (e.g. "river bank" for banco, which means a financial bank or a bench). When false, span and replacement are "".
- span: the exact English text to replace, copied character-for-character from the sentence. If the item has a determiner, span is exactly "<determiner> <englishMatch>" and replacement includes the Spanish determiner ("the strike" → "la huelga", "Our house" → "Nuestra casa", "my friends" → "mis amigos"). Without one, span is just englishMatch. Never include adjectives or other words.
- replacement: the Spanish for span, inflected to fit: article, gender, number, verb person and tense ("la huelga", "unas casas", "mis amigos", "trabajaba"). Keep the original capitalization if span starts the sentence.
Without a determiner in span, the replacement must not start with an article ("a smear campaign": span "campaign" → "campaña", never "una campaña").
Never translate any other words.`;

export type TranslateInput = { sentence: string; lemma: string; englishMatch: string; senses?: string[] };
export type TranslateOutput = { span: string; replacement: string } | null;

const DETERMINERS = new Set("the a an this that these those my your his her its our their".split(" "));

const ES_ARTICLE = /^(el|la|los|las|un|una|unos|unas)\s+/i;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Last check on a word swap before it reaches the page (D-018 update). Applied when serving, so it also fixes
 * entries already in the translate cache. Returns the replacement to show, or null = don't swap.
 * - No English determiner in span → no Spanish article either ("a smear campaign" must not become "a smear una campaña").
 * - A replacement identical to the English is a no-op ("Popular" → "Popular").
 * - For non-verb lemmas the replacement must contain the lemma's stem, so a different word filed under this lemma
 *   ("still" → "todavía" for quieto) is dropped. Verbs are exempt (fue, tuvo, hizo).
 */
export function cleanSwap(lemma: string, span: string, replacement: string): string | null {
  let out = replacement.trim();
  const firstWord = span.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const article = ES_ARTICLE.exec(out);
  if (!DETERMINERS.has(firstWord) && article && out.length > article[0].length) {
    const rest = out.slice(article[0].length);
    out = /^[A-ZÁÉÍÓÚÑ]/.test(out) ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
  }
  if (!out || out.toLowerCase() === span.trim().toLowerCase()) return null;
  if (lemma.length >= 3 && !/(ar|er|ir)$/.test(lemma) && !fold(out).includes(fold(lemma).slice(0, 3))) return null;
  return out;
}

/** The determiner/possessive directly before englishMatch in the sentence, as written ("The", "my"), or undefined. */
export function determinerBefore(sentence: string, englishMatch: string): string | undefined {
  const at = sentence.toLowerCase().indexOf(englishMatch.toLowerCase());
  if (at <= 0) return undefined;
  const prev = /(\S+)\s+$/.exec(sentence.slice(0, at))?.[1];
  return prev && DETERMINERS.has(prev.toLowerCase()) ? prev : undefined;
}

/**
 * Words per Haiku call. Small groups run in parallel, so a page waits for the slowest group, not one big call.
 * Big immersion batches (D-018) use bigger groups so 150+ words don't queue behind the concurrency cap; a normal
 * page (≤ 32 uncached words) keeps the original 4.
 */
const TRANSLATE_CHUNK = 4;
const TRANSLATE_CHUNK_BIG = 8;
const BIG_BATCH = 32;

/** Haiku calls in flight at once, shared by word and sentence translation, so a big page can't burst past rate limits. */
const TRANSLATE_CONCURRENCY = 8;
let translateInFlight = 0;
const translateWaiting: (() => void)[] = [];

/** Runs fn once a slot is free (so its timeout only starts then). A finished call hands its slot to the next waiter. */
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (translateInFlight < TRANSLATE_CONCURRENCY) translateInFlight++;
  else await new Promise<void>((resolve) => translateWaiting.push(resolve));
  try {
    return await fn();
  } finally {
    const next = translateWaiting.shift();
    if (next) next();
    else translateInFlight--;
  }
}

/**
 * Translate a page's batch. Results are in input order: null = sense mismatch or unusable output (don't swap),
 * undefined = that group's call failed (don't swap, and don't cache: a reload retries it). Throws only if every
 * group failed.
 */
export async function translateBatch(items: TranslateInput[]): Promise<(TranslateOutput | undefined)[]> {
  const size = items.length > BIG_BATCH ? TRANSLATE_CHUNK_BIG : TRANSLATE_CHUNK;
  const chunks: TranslateInput[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  const settled = await Promise.allSettled(chunks.map((c) => limited(() => translateChunk(c))));
  if (settled.every((r) => r.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
  return settled.flatMap((r, k) => (r.status === "fulfilled" ? r.value : chunks[k].map(() => undefined)));
}

async function translateChunk(items: TranslateInput[]): Promise<TranslateOutput[]> {
  const dets = items.map((it) => determinerBefore(it.sentence, it.englishMatch));
  const res = await getClaude().messages.parse(
    {
      model: MODELS.correction, // Haiku; translate shares the correction-lane model (web/CLAUDE.md)
      max_tokens: 4000,
      system: TRANSLATE_SYSTEM,
      // Translation needs no reasoning; thinking off is allowed on Haiku 5.5 at effort low and cuts latency.
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(TranslateOut) },
      messages: [
        { role: "user", content: JSON.stringify(items.map((it, i) => ({ i, ...it, ...(dets[i] && { determiner: dets[i] }) }))) },
      ],
    },
    { timeout: 10_000, maxRetries: 1 },
  );
  if (res.stop_reason !== "end_turn" || !res.parsed_output) throw new Error(`translate stop_reason=${res.stop_reason}`);
  const byIndex = new Map(res.parsed_output.items.map((r) => [r.i, r]));
  return items.map((_, i) => {
    const r = byIndex.get(i);
    if (!r || !r.match || !r.span || !r.replacement) return null;
    // A dropped determiner would leave "the la huelga" / "the huelga" on the page: don't swap.
    if (dets[i] && !r.span.startsWith(`${dets[i]} `)) return null;
    return { span: r.span, replacement: r.replacement };
  });
}

// ---- Sentence translate (/api/translate-sentences, D-018 immersion dial) ----

const SentenceOut = z.object({
  items: z.array(z.object({ i: z.number().int(), spanish: z.string() })),
});

const SENTENCE_SYSTEM = `You translate English text for a language learner reading a news article in English.
Each item has i and text: a sentence or a short paragraph from the article.
Return one item per input with the same i, where spanish is the text in natural, fluent Latin American Spanish at the same register.
- Translate everything. Never summarize, shorten, add, or explain.
- Keep names, numbers, and quotation marks as they are.`;

/** Texts per Haiku call: a text can be a whole paragraph, so groups stay small and run in parallel. */
const SENTENCE_CHUNK = 3;

/**
 * Translate whole sentences/paragraphs. Results are in input order: string = Spanish, null = unusable (missing,
 * empty, or unchanged), undefined = that group's call failed (don't cache). Throws only if every group failed.
 */
export async function translateSentences(texts: string[]): Promise<(string | null | undefined)[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += SENTENCE_CHUNK)
    chunks.push(texts.slice(i, i + SENTENCE_CHUNK));
  const settled = await Promise.allSettled(
    chunks.map((c) => limited(() => translateSentenceChunk(c))),
  );
  if (settled.every((r) => r.status === "rejected"))
    throw (settled[0] as PromiseRejectedResult).reason;
  return settled.flatMap((r, k) =>
    r.status === "fulfilled" ? r.value : chunks[k].map(() => undefined),
  );
}

async function translateSentenceChunk(texts: string[]): Promise<(string | null)[]> {
  const res = await getClaude().messages.parse(
    {
      model: MODELS.correction, // Haiku, like word translate
      max_tokens: 4000,
      system: SENTENCE_SYSTEM,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(SentenceOut) },
      messages: [{ role: "user", content: JSON.stringify(texts.map((text, i) => ({ i, text }))) }],
    },
    { timeout: 20_000, maxRetries: 1 },
  );
  if (res.stop_reason !== "end_turn" || !res.parsed_output)
    throw new Error(`translate-sentences stop_reason=${res.stop_reason}`);
  const byIndex = new Map(res.parsed_output.items.map((r) => [r.i, r.spanish.trim()]));
  return texts.map((text, i) => {
    const es = byIndex.get(i);
    if (!es || es.toLowerCase() === text.trim().toLowerCase()) return null;
    return es;
  });
}
