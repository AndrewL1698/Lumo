import { CandidatesResponse, type Understanding } from "@parrot/shared";
import { checkExtensionToken } from "@/lib/auth";
import { lessonData } from "@/lib/learner/curriculum";
import { getSettings, keyLemmas, understanding, weakWords } from "@/lib/learner/queries";
import { DEMO_USER_ID, TUTOR } from "@/lib/config";
import { errText, getDb } from "@/lib/db";
import { json, preflight, withCors } from "@/lib/http";
import { levelToBand, rowToUserWord, USER_WORD_COLUMNS } from "@/lib/learner/rows";
import { toCandidate, type Candidate } from "@/lib/learner/score";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** D-019 extras: a failure only drops the new fields, never the candidate list. */
function soft<T>(label: string, p: Promise<T>): Promise<T | null> {
  return p.catch((err: unknown) => {
    console.error(`[api/candidates] ${label} failed:`, errText(err));
    return null;
  });
}

// Every user_words row with its scoring flags. The extension applies the weights and 70/30 mix.
// Flags per brief 3.1: weak list from the latest tutor recap, known_assumed for bands below the level (score.ts).
// D-019: isKey per candidate (key words, always Spanish) and the learner's understanding points (the immersion %).
export async function GET(req: Request) {
  const denied = checkExtensionToken(req);
  if (denied) return denied;
  const now = new Date();
  let candidates: (Candidate & { isKey?: boolean })[] = [];
  let points: Understanding | null = null;
  try {
    const db = getDb();
    const [words, settings, weakList, keys, u, lesson] = await Promise.all([
      db.from("user_words").select(`${USER_WORD_COLUMNS}, words(band)`).eq("user_id", DEMO_USER_ID),
      getSettings(DEMO_USER_ID),
      weakWords(DEMO_USER_ID),
      soft("keyLemmas", keyLemmas(DEMO_USER_ID, now)),
      soft("understanding", understanding(DEMO_USER_ID)),
      // D-022: today's unit words are key words too, so reading reinforces the lesson.
      TUTOR.curriculum ? soft("lesson", lessonData(DEMO_USER_ID)) : Promise.resolve(null),
    ]);
    for (const lemma of lesson?.unit.words ?? []) keys?.add(lemma);
    if (words.error) throw words.error;
    const userBand = levelToBand(settings.level);
    points = u;

    candidates = words.data.map((row) => {
      const joined = row.words as { band: number } | { band: number }[] | null;
      const wordBand = (Array.isArray(joined) ? joined[0]?.band : joined?.band) ?? 1;
      const c = toCandidate(rowToUserWord(row), { wordBand, userBand, weakList, now });
      return keys ? { ...c, isKey: keys.has(c.lemma) } : c;
    });
  } catch (err) {
    // Degrade to "no candidates": the extension simply makes no swaps.
    console.error("[api/candidates] failed:", errText(err));
  }
  return withCors(
    json({ candidates, generatedAt: now.getTime(), ...(points && { understanding: points }) }, CandidatesResponse),
  );
}
