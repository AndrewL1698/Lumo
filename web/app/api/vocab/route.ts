import { VocabResponse, type VocabItem } from "@parrot/shared";
import { DEMO_USER_ID } from "@/lib/config";
import { errText, getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { rowToUserWord, USER_WORD_COLUMNS } from "@/lib/learner/rows";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const STEADY_DAYS = 7; // D-027: how long a "Knew it" keeps a learning word under Glowing steady
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
    const [words, events, verdicts] = await Promise.all([
      db.from("user_words").select(`${USER_WORD_COLUMNS}, words(article, english)`).eq("user_id", DEMO_USER_ID),
      db
        .from("events")
        .select("ts")
        .eq("user_id", DEMO_USER_ID)
        .gte("ts", new Date(now.getTime() - 120 * DAY_MS).toISOString()),
      db
        .from("events")
        .select("lemma, type")
        .eq("user_id", DEMO_USER_ID)
        .in("type", ["knew_it", "didnt_know", "spoken_incorrect"])
        .not("lemma", "is", null)
        .gte("ts", new Date(now.getTime() - STEADY_DAYS * DAY_MS).toISOString())
        .order("ts", { ascending: false }),
    ]);
    if (words.error) throw words.error;
    if (events.error) throw events.error;
    if (verdicts.error) throw verdicts.error;

    // D-027: a learning word whose newest verdict in the last week is "Knew it" is listed as glowing steady.
    // Display only: its state stays `learning` (known needs proof, §6.1), so lessons still test it.
    const newest = new Map<string, string>();
    for (const v of verdicts.data) if (!newest.has(v.lemma as string)) newest.set(v.lemma as string, v.type as string);

    for (const row of words.data) {
      const w = rowToUserWord(row);
      if (w.state !== "learning" && w.state !== "known" && w.state !== "mastered") continue;
      const joined = row.words as { article: string | null; english: string[] } | { article: string | null; english: string[] }[] | null;
      const word = Array.isArray(joined) ? joined[0] : joined;
      const steady = w.state === "learning" && newest.get(w.lemma) === "knew_it";
      lists[steady ? "known" : w.state].push({
        lemma: w.lemma,
        article: word?.article ?? null,
        english: (word?.english ?? []).join("; "),
        state: w.state,
        dueAt: w.dueAt,
        ...(steady && { selfReported: true }),
      });
    }
    // Learning: most overdue first. The other lists: alphabetical.
    lists.learning.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    lists.known.sort((a, b) => a.lemma.localeCompare(b.lemma, "es"));
    lists.mastered.sort((a, b) => a.lemma.localeCompare(b.lemma, "es"));
    streakDays = streak(events.data.map((e) => e.ts as string), now);
  } catch (err) {
    // Degrade to empty lists rather than an error page.
    console.error("[api/vocab] failed:", errText(err));
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
