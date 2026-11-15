import { EndRequest, Recap, recapFixture } from "@parrot/shared";
import { NextResponse } from "next/server";
import { ClaudeRefusalError, writeRecap } from "@/lib/claude";
import { isTutorMock } from "@/lib/config";
import { json, parseBody } from "@/lib/http";
import { buildRecapLists, buildRecapUserMessage } from "@/lib/tutor/recap";
import { findSession } from "@/lib/tutor/session";

const RECAP_TIMEOUT_MS = 4000;
const SUMMARY_EMPTY = "Thanks for practising! There's nothing to recap from this session yet.";
const SUMMARY_CLEAN = "Nice work! Keep talking to Luci to practise your new words.";
const SUMMARY_FALLBACK = "Nice work today! Here is what to look at before your next session.";

/** One short line for the server log; never sent to the client. */
function reason(err: unknown, timedOut: boolean): string {
  if (timedOut) return `timeout after ${RECAP_TIMEOUT_MS}ms`;
  if (err instanceof ClaudeRefusalError) return "refusal";
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return msg.split("\n")[0].slice(0, 200);
}

export async function POST(req: Request) {
  const body = await parseBody(req, EndRequest);
  if (body instanceof NextResponse) return body;
  if (isTutorMock()) return json(recapFixture, Recap);

  const session = findSession(body.sessionId);
  // fromContext only gates learner-model writes; a session on the fixture context (DB down) still gets its recap.
  if (!session) {
    return json(
      { topErrors: [], wordsNowKnown: [], reviewTomorrow: [], summary_en: SUMMARY_EMPTY, tips: [] },
      Recap,
    );
  }

  const lists = buildRecapLists(session);
  if (lists.topErrors.length === 0 && lists.wordsNowKnown.length === 0) {
    return json({ ...lists, summary_en: SUMMARY_CLEAN, tips: [] }, Recap);
  }

  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, RECAP_TIMEOUT_MS);
  try {
    const prose = await writeRecap(buildRecapUserMessage(lists, session.context.level), ac.signal);
    return json(
      { ...lists, summary_en: prose.summary_en, tips: prose.tips.slice(0, lists.topErrors.length) },
      Recap,
    );
  } catch (err) {
    console.error(`[end] ${body.sessionId} recap failed: ${reason(err, timedOut)}`);
    return json({ ...lists, summary_en: SUMMARY_FALLBACK, tips: [] }, Recap);
  } finally {
    clearTimeout(timer);
  }
}
