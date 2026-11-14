import { CorrectRequest, CorrectResponse, correctResponseFixture } from "@parrot/shared";
import { NextResponse } from "next/server";
import { ClaudeRefusalError, correctUtterance } from "@/lib/claude";
import { DEMO_USER_ID, isTutorMock, TUTOR } from "@/lib/config";
import { json, parseBody } from "@/lib/http";
import { recordTutorEvent } from "@/lib/learner/record";
import { recordCorrection, getSession } from "@/lib/tutor/session";
import { creditTargetWords } from "@/lib/tutor/targetWords";
import type { ValidatedCorrection } from "@/lib/tutor/types";
import { canonicalLemma, validateCorrection } from "@/lib/tutor/validate";

const EMPTY: ValidatedCorrection = { shown: [], kept: [], target_words_used: [], overall_ok: true };
const FAILED_HEADER = { "X-Correction-Failed": "1" };

/** One short line for the server log; never sent to the client. */
function reason(err: unknown, timedOut: boolean): string {
  if (timedOut) return `timeout after ${TUTOR.correctTimeoutMs}ms`;
  if (err instanceof ClaudeRefusalError) return "refusal";
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return msg.split("\n")[0].slice(0, 200);
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = await parseBody(req, CorrectRequest);
  if (body instanceof NextResponse) return body;
  const { sessionId, utteranceId, rawText, tutorPrevious, sttPath } = body; // rawText is never trimmed or edited

  if (isTutorMock()) {
    const { correction } = correctResponseFixture;
    recordCorrection(sessionId, correction.errors, correction.target_words_used);
    console.log(`[correct] ${utteranceId} stt=${sttPath} mock`);
    return json(
      { ...correctResponseFixture, correction: { ...correction, utterance_id: utteranceId } },
      CorrectResponse,
    );
  }

  let v: ValidatedCorrection;
  let failed = false;
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, TUTOR.correctTimeoutMs);
  try {
    const session = getSession(sessionId);
    const model = await correctUtterance({
      rawText,
      level: session.context.level,
      targetWords: session.context.targetWords,
      tutorPrevious,
      signal: ac.signal,
    });
    v = validateCorrection(rawText, model);
    // "la casa" / "Casa" → the session's exact lemma, for the policy, the response and the learner model.
    const targets = session.context.targetWords;
    v.target_words_used = v.target_words_used.map((u) => ({ ...u, lemma: canonicalLemma(u.lemma, targets) }));
    // Check the outgoing shape now, so a bad model field becomes an empty correction, not a 500.
    CorrectResponse.shape.correction.parse({
      utterance_id: utteranceId,
      errors: v.kept,
      target_words_used: v.target_words_used,
      overall_ok: v.overall_ok,
    });
  } catch (err) {
    v = EMPTY;
    failed = true;
    console.error(`[correct] ${utteranceId} failed: ${reason(err, timedOut)}`);
  } finally {
    clearTimeout(timer);
  }

  // Exactly once per request, also on failure: it advances the turn counter.
  recordCorrection(sessionId, v.kept, v.target_words_used);

  // Never throws; each DB write is capped at TUTOR.recordTimeoutMs.
  const wordUpdates = failed
    ? []
    : await creditTargetWords({
        sessionId,
        userId: DEMO_USER_ID,
        rawText,
        tutorPrevious,
        kept: v.kept,
        used: v.target_words_used,
        record: recordTutorEvent,
      });

  const serverMs = Date.now() - t0;
  console.log(
    `[correct] ${utteranceId} stt=${sttPath} shown=${v.shown.length} kept=${v.kept.length} words=${wordUpdates.length} serverMs=${serverMs}${failed ? " FAILED" : ""}`,
  );
  return json(
    {
      correction: {
        utterance_id: utteranceId,
        errors: v.shown,
        target_words_used: v.target_words_used,
        overall_ok: v.overall_ok,
      },
      wordUpdates,
      serverMs,
    },
    CorrectResponse,
    failed ? { headers: FAILED_HEADER } : undefined,
  );
}
