import { VocabResponse, type VocabItem } from "@parrot/shared";
import { DEMO_USER_ID } from "@/lib/config";
import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { rowToUserWord, USER_WORD_COLUMNS } from "@/lib/learner/rows";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; // server-local day

/** Consecutive days with ≥1 event, ending today (or yesterday, so the streak survives until tonight). */
function streak(eventTimes: string[], now: Date): number {
  const days = new Set(eventTimes.map((t) => dayKey(new Date(t))));
  let d = new Date(now);
  if (!days.has(dayKey(d))) d = new Date(d.getTime() - DAY_MS);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d = new Date(d.getTime() - DAY_MS);
  }
  return n;
}

// specs §6.3: Learning / Your vocabulary (known) / Mastered, plus streak.
export async function GET() {
  const now = new Date();
  const lists: Record<"learning" | "known" | "mastered", VocabItem[]> = { learning: [], known: [], mastered: [] };
  let streakDays = 0;
  try {
    const db = getDb();
    const [words, events] = await Promise.all([
      db.from("user_words").select(`${USER_WORD_COLUMNS}, words(article, english)`).eq("user_id", DEMO_USER_ID),
      db
        .from("events")
        .select("ts")
        .eq("user_id", DEMO_USER_ID)
        .gte("ts", new Date(now.getTime() - 120 * DAY_MS).toISOString()),
    ]);
    if (words.error) throw words.error;
    if (events.error) throw events.error;

    for (const row of words.data) {
      const w = rowToUserWord(row);
      if (w.state !== "learning" && w.state !== "known" && w.state !== "mastered") continue;
      const joined = row.words as { article: string | null; english: string[] } | { article: string | null; english: string[] }[] | null;
      const word = Array.isArray(joined) ? joined[0] : joined;
      lists[w.state].push({
        lemma: w.lemma,
        article: word?.article ?? null,
        english: (word?.english ?? []).join("; "),
        state: w.state,
        dueAt: w.dueAt,
      });
    }
    // Learning: most overdue first. The other lists: alphabetical.
    lists.learning.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    lists.known.sort((a, b) => a.lemma.localeCompare(b.lemma, "es"));
    lists.mastered.sort((a, b) => a.lemma.localeCompare(b.lemma, "es"));
    streakDays = streak(events.data.map((e) => e.ts as string), now);
  } catch (err) {
    // Degrade to empty lists rather than an error page.
    console.error("[api/vocab] failed", err);
  }

  return json(
    {
      ...lists,
      counts: { learning: lists.learning.length, known: lists.known.length, mastered: lists.mastered.length },
      streakDays,
    },
    VocabResponse,
  );
}
