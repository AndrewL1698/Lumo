import { TutorContext } from "@parrot/shared";
import { warmUpCorrector } from "@/lib/claude";
import { json } from "@/lib/http";
import { DEMO_USER_ID, TUTOR, isTutorMock } from "@/lib/config";
import { lessonData } from "@/lib/learner/curriculum";
import { getTutorContextData } from "@/lib/learner/queries";
import { fixtureContext, loadTutorContext, type LoadedContext } from "@/lib/tutor/context";
import { getSession, setSessionContext } from "@/lib/tutor/session";

export const dynamic = "force-dynamic";

/** Real session context from the learner model; the fixture (fresh sessionId) when mocked, DB off, failing or slow. */
export async function GET(req?: Request) {
  // Onboarding level check (D-020): an empty beginner context, no DB, so it works for a brand-new learner.
  if (req && new URL(req.url).searchParams.get("placement") === "1") {
    const context: TutorContext = {
      ...fixtureContext(),
      hoveredWords: [],
      dueWords: [],
      articleTitles: [],
      topErrors: [],
      targetWords: [],
      level: "beginner",
    };
    setSessionContext(context.sessionId, context);
    getSession(context.sessionId).placement = true;
    console.log(`[tutor/context] ${context.sessionId} placement check`);
    return json(context, TutorContext, { headers: { "X-Context-Source": "placement", "Cache-Control": "no-store" } });
  }

  const { context, source, reason }: LoadedContext = isTutorMock()
    ? { context: fixtureContext(), source: "fixture", reason: "TUTOR_MOCK" }
    : await loadTutorContext(async () => {
        const data = await getTutorContextData(DEMO_USER_ID);
        // D-022: the course is optional. Any failure here means "no lesson", exactly today's tutor.
        if (TUTOR.curriculum) data.lesson = await lessonData(DEMO_USER_ID).catch(() => null);
        return data;
      }, TUTOR.contextTimeoutMs);

  // /api/tutor/correct and /reply read this exact context by sessionId.
  // Only a real (DB) context may credit target words: fixture targets must never change the demo user's words.
  setSessionContext(context.sessionId, context, { credit: source === "db" });

  // Not awaited: compiles the corrector's output schema now, so the first spoken turn does not pay for it.
  if (!isTutorMock()) void warmUpCorrector();

  const targets = context.targetWords.map((w) => w.lemma).join(",");
  console.log(
    `[tutor/context] ${context.sessionId} source=${source} targets=${targets} articles=${context.articleTitles.length}` +
      (source === "fixture" && reason ? ` reason=${reason}` : ""),
  );

  return json(context, TutorContext, { headers: { "X-Context-Source": source, "Cache-Control": "no-store" } });
}
