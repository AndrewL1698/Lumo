import { CandidatesResponse, Settings, settingsFixture } from "@parrot/shared";
import { DEMO_USER_ID } from "@/lib/config";
import { getDb } from "@/lib/db";
import { json, preflight, withCors } from "@/lib/http";
import { levelToBand, rowToUserWord, USER_WORD_COLUMNS } from "@/lib/learner/rows";
import { toCandidate, type Candidate } from "@/lib/learner/score";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Every user_words row with its scoring flags. The extension applies the weights and 70/30 mix.
// TODO(demo): Bearer token isn't checked yet.
// TODO(karthik): 3.1 weak list from utterances.correction, known_assumed for bands below the level.
export async function GET() {
  const now = new Date();
  let candidates: Candidate[] = [];
  try {
    const db = getDb();
    const [words, settings] = await Promise.all([
      db.from("user_words").select(`${USER_WORD_COLUMNS}, words(band)`).eq("user_id", DEMO_USER_ID),
      db.from("settings").select("data").eq("user_id", DEMO_USER_ID).maybeSingle(),
    ]);
    if (words.error) throw words.error;
    const parsed = Settings.safeParse(settings.data?.data);
    const userBand = levelToBand((parsed.success ? parsed.data : settingsFixture).level);
    const weakList = new Set<string>();

    candidates = words.data.map((row) => {
      const joined = row.words as { band: number } | { band: number }[] | null;
      const wordBand = (Array.isArray(joined) ? joined[0]?.band : joined?.band) ?? 1;
      return toCandidate(rowToUserWord(row), { wordBand, userBand, weakList, now });
    });
  } catch (err) {
    // Degrade to "no candidates": the extension simply makes no swaps.
    console.error("[api/candidates] failed", err);
  }
  return withCors(json({ candidates, generatedAt: now.getTime() }, CandidatesResponse));
}
