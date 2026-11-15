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

/** `flag` and `spanish_version` for the response, present only when set. */
function flagFields(v: ValidatedCorrection) {
  return {
    ...(v.flag ? { flag: v.flag } : {}),
    ...(v.spanish_version ? { spanish_version: v.spanish_version } : {}),
  };
}

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
  let modelMs = 0;
  let outChars = 0;
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, TUTOR.correctTimeoutMs);
  try {
    const session = getSession(sessionId);
    const tModel = Date.now();
    const model = await correctUtterance({
      rawText,
      level: session.context.level,
      targetWords: session.context.targetWords,
      tutorPrevious,
      signal: ac.signal,
    }).finally(() => {
      modelMs = Date.now() - tModel;
    });
    outChars = JSON.stringify(model).length;
    v = validateCorrection(rawText, model, tutorPrevious);
    // "la casa" / "Casa" → the session's exact lemma, for the policy, the response and the learner model.
    const targets = session.context.targetWords;
    v.target_words_used = v.target_words_used.map((u) => ({ ...u, lemma: canonicalLemma(u.lemma, targets) }));
    // Check the outgoing shape now, so a bad model field becomes an empty correction, not a 500.
    CorrectResponse.shape.correction.parse({
      utterance_id: utteranceId,
      errors: v.kept,
      target_words_used: v.target_words_used,
      overall_ok: v.overall_ok,
      ...flagFields(v),
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
  // Only sessions /api/tutor/context started may write learner events: an eval run or a session that
  // outlived a server restart runs on the fixture targets and must not change the demo user's words.
  const credit = !failed && getSession(sessionId).fromContext;
  if (!failed && !credit) console.log(`[correct] ${utteranceId} no word credit: session not started by /context`);
  const tDb = Date.now();
  const wordUpdates = !credit
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
  const dbMs = credit ? Date.now() - tDb : 0;

  const serverMs = Date.now() - t0;
  console.log(
    `[correct] ${utteranceId} stt=${sttPath} shown=${v.shown.length} kept=${v.kept.length} words=${wordUpdates.length} serverMs=${serverMs} modelMs=${modelMs} dbMs=${dbMs} outChars=${outChars}${v.flag ? ` flag=${v.flag}` : ""}${failed ? " FAILED" : ""}`,
  );
  return json(
    {
      correction: {
        utterance_id: utteranceId,
        errors: v.shown,
        target_words_used: v.target_words_used,
        overall_ok: v.overall_ok,
        ...flagFields(v),
      },
      wordUpdates,
      serverMs,
    },
    CorrectResponse,
    failed ? { headers: FAILED_HEADER } : undefined,
  );
}
