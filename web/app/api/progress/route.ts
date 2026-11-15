import { ProgressResponse, progressResponseFixture } from "@parrot/shared";
import { DEMO_USER_ID } from "@/lib/config";
import { errText } from "@/lib/db";
import { json } from "@/lib/http";
import { computeTrack } from "@/lib/learner/curriculum";

export const dynamic = "force-dynamic";

// D-022: the learner's course (units, words known, checkpoint). Web pages only, so no bearer token (like /api/vocab).
export async function GET() {
  try {
    const { progress } = await computeTrack(DEMO_USER_ID);
    return json(progress, ProgressResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Degrade to the fixture: the page still shows a course.
    console.error("[api/progress] failed:", errText(err));
    return json(progressResponseFixture, ProgressResponse);
  }
}
