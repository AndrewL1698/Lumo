/**
 * The ONLY module that imports @anthropic-ai/sdk.
 * Direct Anthropic API only; keep the provider swappable here so routes never touch the SDK.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Level, TargetWord } from "@parrot/shared";
import type { ModelCorrection } from "./tutor/types";

/** Thrown by either lane when the model returns stop_reason "refusal". */
export class ClaudeRefusalError extends Error {}

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
  signal?: AbortSignal;
}): Promise<ModelCorrection> {
  throw new Error("not implemented");
}

// TODO(andrew): conversation lane (MODELS.conversation, streaming text deltas).
// eslint-disable-next-line require-yield -- stub; the real version yields text deltas.
export async function* streamTutorReply(_args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  throw new Error("not implemented");
}

// TODO(andrew): end-of-session recap prose.
export async function writeRecap(_input: unknown): Promise<{ summary_en: string; tips: string[] }> {
  throw new Error("not implemented");
}

// TODO(karthik): the in-context translate (/api/translate) and word-list Haiku calls go here too.
