import {
  TutorTranslateRequest,
  TutorTranslateResponse,
  tutorTranslateResponseFixture,
  type ApiError,
} from "@parrot/shared";
import { NextResponse } from "next/server";
import { translateTutorLine } from "@/lib/claude";
import { isTutorMock, TUTOR } from "@/lib/config";
import { json, parseBody } from "@/lib/http";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * English for one finished tutor line. A separate call so it never delays the spoken reply or the
 * correction. A non-2xx here means "no English for this line": the client shows nothing.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, TutorTranslateRequest);
  if (body instanceof NextResponse) return body;
  if (isTutorMock())
    return json(tutorTranslateResponseFixture, TutorTranslateResponse, { headers: NO_STORE });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TUTOR.translateTimeoutMs);
  try {
    const english = await translateTutorLine(body.text, ac.signal);
    return json({ english }, TutorTranslateResponse, { headers: NO_STORE });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[tutor/translate] failed: ${msg.split("\n")[0].slice(0, 200)}`);
    const error: ApiError = { error: "translation unavailable" };
    return NextResponse.json(error, { status: 502, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
