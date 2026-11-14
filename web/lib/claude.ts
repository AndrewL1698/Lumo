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

// TODO(karthik): the in-context translate (/api/translate) and word-list Haiku calls go here too.
