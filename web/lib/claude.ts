/**
 * The ONLY module that imports @anthropic-ai/sdk.
 * Direct Anthropic API only; keep the provider swappable here so routes never touch the SDK.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CorrectionResult, Level, TargetWord } from "@parrot/shared";
import { z } from "zod";
import { MODELS } from "./config";

let client: Anthropic | undefined;

/** Constructed on first use so a missing ANTHROPIC_API_KEY never breaks the build. */
export function getClaude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// TODO(andrew): correction lane (MODELS.correction, structured output → CorrectionResult minus utterance_id).
export async function correctUtterance(_args: {
  rawText: string;
  level: Level;
  targetWords: TargetWord[];
  tutorPrevious?: string;
}): Promise<Omit<CorrectionResult, "utterance_id">> {
  throw new Error("not implemented");
}

// TODO(andrew): conversation lane (MODELS.conversation, streaming text deltas).
// eslint-disable-next-line require-yield -- stub; the real version yields text deltas.
export async function* streamTutorReply(_args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}): AsyncIterable<string> {
  throw new Error("not implemented");
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

/** One Haiku call per batch. Results are in input order; null = sense mismatch or unusable output. */
export async function translateBatch(items: TranslateInput[]): Promise<TranslateOutput[]> {
  const dets = items.map((it) => determinerBefore(it.sentence, it.englishMatch));
  const res = await getClaude().messages.parse(
    {
      model: MODELS.correction, // Haiku; translate shares the correction-lane model (web/CLAUDE.md)
      max_tokens: 4000,
      system: TRANSLATE_SYSTEM,
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
