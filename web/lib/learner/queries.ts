// Read helpers for routes and Andrew's /api/tutor/context (brief 3.5). Relative imports only (tsx from /scripts, /eval).
import { Settings, settingsFixture } from "@parrot/shared";
import { getDb } from "../db";

/** The user's settings row, or the fixture values if there is none (or it doesn't parse). */
export async function getSettings(userId: string): Promise<Settings> {
  const { data, error } = await getDb().from("settings").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const parsed = Settings.safeParse(data?.data);
  return parsed.success ? parsed.data : settingsFixture;
}

export async function putSettings(userId: string, settings: Settings): Promise<void> {
  const { error } = await getDb().from("settings").upsert({ user_id: userId, data: settings }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Most recent hovers, newest first, one per lemma, with the sentence the word appeared in. */
export async function recentHovers(userId: string, limit = 10): Promise<{ lemma: string; sentence?: string }[]> {
  const { data, error } = await getDb()
    .from("events")
    .select("lemma, meta")
    .eq("user_id", userId)
    .eq("type", "hover")
    .not("lemma", "is", null)
    .order("ts", { ascending: false })
    .limit(limit * 5);
  if (error) throw error;
  const seen = new Map<string, { lemma: string; sentence?: string }>();
  for (const r of data) {
    const lemma = r.lemma as string;
    if (seen.has(lemma)) continue;
    const sentence = (r.meta as { sentence?: unknown } | null)?.sentence;
    seen.set(lemma, typeof sentence === "string" ? { lemma, sentence } : { lemma });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** Lemmas whose FSRS review is due, most overdue first. */
export async function dueLemmas(userId: string, now: Date = new Date(), limit = 20): Promise<string[]> {
  const { data, error } = await getDb()
    .from("user_words")
    .select("lemma")
    .eq("user_id", userId)
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data.map((r) => r.lemma as string);
}

/** Titles of articles read since local midnight (server time), newest first. */
export async function todaysArticleTitles(userId: string, now: Date = new Date()): Promise<string[]> {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const { data, error } = await getDb()
    .from("articles")
    .select("title")
    .eq("user_id", userId)
    .gte("ts", midnight.toISOString())
    .order("ts", { ascending: false });
  if (error) throw error;
  return data.map((r) => r.title as string | null).filter((t): t is string => !!t);
}

/** Dictionary details for a list of lemmas (unknown lemmas are omitted). */
export async function wordDetails(lemmas: string[]): Promise<{ lemma: string; article: string | null; english: string[] }[]> {
  if (lemmas.length === 0) return [];
  const { data, error } = await getDb().from("words").select("lemma, article, english").in("lemma", lemmas);
  if (error) throw error;
  return data.map((r) => ({ lemma: r.lemma as string, article: r.article as string | null, english: r.english as string[] }));
}
