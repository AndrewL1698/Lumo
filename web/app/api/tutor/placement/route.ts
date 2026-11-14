import { PlacementRequest, PlacementResponse, placementResponseFixture, type ApiError } from "@parrot/shared";
import { assessPlacement } from "@/lib/claude";
import { isTutorMock, TUTOR } from "@/lib/config";
import { json, parseBody } from "@/lib/http";
import { getSession } from "@/lib/tutor/session";
import { NextResponse } from "next/server";

/** Onboarding level check (D-020): suggest a level from the three answers. A non-2xx means "keep the learner's own pick". */
export async function POST(req: Request) {
  const body = await parseBody(req, PlacementRequest);
  if (body instanceof NextResponse) return body;
  if (isTutorMock()) return json(placementResponseFixture, PlacementResponse);

  try {
    const result = await assessPlacement({
      history: body.history,
      errors: getSession(body.sessionId).allErrors,
      signal: AbortSignal.timeout(TUTOR.placementTimeoutMs),
    });
    console.log(`[tutor/placement] ${body.sessionId} level=${result.level}`);
    return json(result, PlacementResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`[tutor/placement] ${body.sessionId} failed: ${err instanceof Error ? err.message : String(err)}`);
    const error: ApiError = { error: "placement unavailable" };
    return NextResponse.json(error, { status: 502 });
  }
}
