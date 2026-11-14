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
import { buildCorrectorPrompt } from "./tutor/prompts";
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
  const response = await getClaude().messages.parse(
    {
      model: MODELS.correction,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(ModelCorrectionSchema) },
      system,
      messages: [{ role: "user", content: user }],
    },
    { signal },
  );
  if (response.stop_reason === "refusal") throw new ClaudeRefusalError("corrector refused");
  if (response.parsed_output === null) {
    throw new Error(`corrector returned no parsable output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/** One tiny call so the structured-output schema is compiled before the first real turn. Never throws. */
export async function warmUpCorrector(): Promise<void> {
  try {
    await correctUtterance({ rawText: "hola", level: "beginner", targetWords: [] });
  } catch {
    // Warm-up only; the real call reports its own errors.
  }
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
    system: args.system,
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

// TODO(andrew): end-of-session recap prose.
export async function writeRecap(_input: unknown): Promise<{ summary_en: string; tips: string[] }> {
  throw new Error("not implemented");
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
Never translate any other words.`;

export type TranslateInput = { sentence: string; lemma: string; englishMatch: string; senses?: string[] };
export type TranslateOutput = { span: string; replacement: string } | null;

const DETERMINERS = new Set("the a an this that these those my your his her its our their".split(" "));

/** The determiner/possessive directly before englishMatch in the sentence, as written ("The", "my"), or undefined. */
export function determinerBefore(sentence: string, englishMatch: string): string | undefined {
  const at = sentence.toLowerCase().indexOf(englishMatch.toLowerCase());
  if (at <= 0) return undefined;
  const prev = /(\S+)\s+$/.exec(sentence.slice(0, at))?.[1];
  return prev && DETERMINERS.has(prev.toLowerCase()) ? prev : undefined;
}

/** Words per Haiku call. Small groups run in parallel, so a page waits for the slowest group, not one big call. */
const TRANSLATE_CHUNK = 4;

/**
 * Translate a page's batch. Results are in input order: null = sense mismatch or unusable output (don't swap),
 * undefined = that group's call failed (don't swap, and don't cache: a reload retries it). Throws only if every
 * group failed.
 */
export async function translateBatch(items: TranslateInput[]): Promise<(TranslateOutput | undefined)[]> {
  const chunks: TranslateInput[][] = [];
  for (let i = 0; i < items.length; i += TRANSLATE_CHUNK) chunks.push(items.slice(i, i + TRANSLATE_CHUNK));
  const settled = await Promise.allSettled(chunks.map(translateChunk));
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
