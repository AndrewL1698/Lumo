import { TutorContext } from "@parrot/shared";
import { warmUpCorrector } from "@/lib/claude";
import { json } from "@/lib/http";
import { DEMO_USER_ID, TUTOR, isTutorMock } from "@/lib/config";
import { getTutorContextData } from "@/lib/learner/queries";
import { fixtureContext, loadTutorContext, type LoadedContext } from "@/lib/tutor/context";
import { setSessionContext } from "@/lib/tutor/session";

export const dynamic = "force-dynamic";

/** Real session context from the learner model; the fixture (fresh sessionId) when mocked, DB off, failing or slow. */
export async function GET() {
  const { context, source, reason }: LoadedContext = isTutorMock()
    ? { context: fixtureContext(), source: "fixture", reason: "TUTOR_MOCK" }
    : await loadTutorContext(() => getTutorContextData(DEMO_USER_ID), TUTOR.contextTimeoutMs);

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
