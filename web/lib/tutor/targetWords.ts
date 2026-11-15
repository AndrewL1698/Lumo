/**
 * Target-word credit after a validated correction (voice-plan §1.6, task 12).
 * The learner-model write is injected (`record`), so this file never imports web/lib/learner at runtime.
 */
import type { CorrectionError, TargetWordUse, WordState, WordUpdate } from "@parrot/shared";
import { TUTOR } from "../config";
import { getSession } from "./session";
import { validateTargetWords } from "./validate";

export type RecordFn = (
  userId: string,
  lemma: string,
  type: "spoken_correct" | "spoken_incorrect",
) => Promise<{ from: WordState; to: WordState }>;

const shortMsg = (err: unknown) =>
  (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).split("\n")[0].slice(0, 200);

/** Validate the turn's target-word uses and write the events. Returns only real state changes. Never throws. */
export async function creditTargetWords(args: {
  sessionId: string;
  userId: string;
  rawText: string;
  tutorPrevious?: string;
  kept: CorrectionError[];
  used: TargetWordUse[];
  record: RecordFn;
  timeoutMs?: number;
}): Promise<WordUpdate[]> {
  try {
    const { sessionId, userId, rawText, tutorPrevious, kept, used, record } = args;
    const timeoutMs = args.timeoutMs ?? TUTOR.recordTimeoutMs;
    const session = getSession(sessionId);
    const verdicts = validateTargetWords({
      rawText,
      targets: session.context.targetWords,
      used,
      kept,
      alreadyCredited: session.creditedLemmas,
      tutorPrevious,
    });

    const results = await Promise.all(
      verdicts.map(async (v): Promise<WordUpdate | null> => {
        console.log(`[correct] word ${v.lemma} ${v.event ?? "none"} ${v.reason}`);
        if (!v.event) return null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`record timeout after ${timeoutMs}ms`)), timeoutMs);
          });
          const change = await Promise.race([record(userId, v.lemma, v.event), timeout]);
          if (change.to === "known" && change.from !== "known") {
            const src = session.context.targetWords.find((t) => t.lemma === v.lemma)?.source;
            const origin = src === "hovered" ? "article" : src === "lesson" ? "course" : "review";
            console.log(
              `[tutor] taught ${v.lemma} (${origin}): ${change.from} → known, +2 understanding points (+1 if it had a "Knew it")`,
            );
          }
          if (v.event === "spoken_correct" && !session.creditedLemmas.includes(v.lemma))
            session.creditedLemmas.push(v.lemma);
          return change.from !== change.to ? { lemma: v.lemma, from: change.from, to: change.to } : null;
        } catch (err) {
          console.error(`[correct] word ${v.lemma} record failed: ${shortMsg(err)}`);
          return null;
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    return results.filter((u): u is WordUpdate => u !== null);
  } catch (err) {
    console.error(`[correct] target words failed: ${shortMsg(err)}`);
    return [];
  }
}
