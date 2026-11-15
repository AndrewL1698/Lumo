import { EndRequest, Recap, recapFixture } from "@parrot/shared";
import { NextResponse } from "next/server";
import { ClaudeRefusalError, writeRecap } from "@/lib/claude";
import { DEMO_USER_ID, isTutorMock, TUTOR } from "@/lib/config";
import { lessonMemoryFor, unitById } from "@/lib/curriculum/checkpoint";
import { errText } from "@/lib/db";
import { saveSessionRecap } from "@/lib/learner/queries";
import type { SessionState } from "@/lib/tutor/types";
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

/**
 * D-022: for a session that taught a course unit, add the lesson memory and keep the recap for next time.
 * Never throws and never delays the response for long: any failure just returns the plain recap.
 */
async function withLesson(session: SessionState, recap: Recap): Promise<Recap> {
  const unit = TUTOR.curriculum && !session.placement && session.fromContext ? unitById(session.context.lesson?.unitId ?? "") : undefined;
  if (!unit) return recap;
  const full: Recap = { ...recap, lesson: lessonMemoryFor(session, unit, recap.summary_en) };
  if (session.policy.turnIndex >= 1) await saveSessionRecap(DEMO_USER_ID, full).catch((err) => console.error("[end] save recap failed:", errText(err)));
  return full;
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
    return json(await withLesson(session, { ...lists, summary_en: SUMMARY_CLEAN, tips: [] }), Recap);
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
      await withLesson(session, { ...lists, summary_en: prose.summary_en, tips: prose.tips.slice(0, lists.topErrors.length) }),
      Recap,
    );
  } catch (err) {
    console.error(`[end] ${body.sessionId} recap failed: ${reason(err, timedOut)}`);
    return json(await withLesson(session, { ...lists, summary_en: SUMMARY_FALLBACK, tips: [] }), Recap);
  } finally {
    clearTimeout(timer);
  }
}
