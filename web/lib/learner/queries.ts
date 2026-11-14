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

export type TutorContextData = {
  level: Settings["level"];
  /** Last 24h, newest first, one per lemma. hoveredAt/articleTitle are for J2's "hovered at 9:12 in …". */
  hoveredWords: { lemma: string; sentence?: string; hoveredAt: string; articleTitle?: string }[];
  /** Most overdue first. */
  dueWords: { lemma: string; dueAt: string }[];
  /** Today's article titles; [] when Settings.useReadingInLessons is off. */
  articleTitles: string[];
};

/** Everything Andrew's /api/tutor/context needs from the DB, in one call. Throws on DB error. */
export async function getTutorContextData(
  userId: string,
  opts: { now?: Date; maxHovers?: number; maxDue?: number } = {},
): Promise<TutorContextData> {
  const { now = new Date(), maxHovers = 10, maxDue = 20 } = opts;
  const db = getDb();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [settings, hovers, due] = await Promise.all([
    getSettings(userId),
    db
      .from("events")
      .select("lemma, article_key, ts, meta")
      .eq("user_id", userId)
      .eq("type", "hover")
      .not("lemma", "is", null)
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(maxHovers * 5),
    db
      .from("user_words")
      .select("lemma, due_at")
      .eq("user_id", userId)
      .lte("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(maxDue),
  ]);
  if (hovers.error) throw hovers.error;
  if (due.error) throw due.error;

  // One row per lemma (newest hover wins).
  const latest = new Map<string, (typeof hovers.data)[number]>();
  for (const h of hovers.data) if (!latest.has(h.lemma as string) && latest.size < maxHovers) latest.set(h.lemma as string, h);

  // Article titles for those hovers.
  const keys = [...new Set([...latest.values()].map((h) => h.article_key as string | null).filter((k): k is string => !!k))];
  const titles = new Map<string, string>();
  if (keys.length) {
    const arts = await db.from("articles").select("article_key, title").eq("user_id", userId).in("article_key", keys);
    if (arts.error) throw arts.error;
    for (const a of arts.data) if (a.title) titles.set(a.article_key as string, a.title as string);
  }

  const hoveredWords = [...latest.values()].map((h) => {
    const sentence = (h.meta as { sentence?: unknown } | null)?.sentence;
    const articleTitle = titles.get(h.article_key as string);
    return {
      lemma: h.lemma as string,
      hoveredAt: new Date(h.ts as string).toISOString(),
      ...(typeof sentence === "string" && { sentence }),
      ...(articleTitle && { articleTitle }),
    };
  });

  return {
    level: settings.level,
    hoveredWords,
    dueWords: due.data.map((r) => ({ lemma: r.lemma as string, dueAt: new Date(r.due_at as string).toISOString() })),
    articleTitles: settings.useReadingInLessons ? await todaysArticleTitles(userId, now) : [],
  };
}

/** Dictionary details for a list of lemmas (unknown lemmas are omitted). */
export async function wordDetails(lemmas: string[]): Promise<{ lemma: string; article: string | null; english: string[] }[]> {
  if (lemmas.length === 0) return [];
  const { data, error } = await getDb().from("words").select("lemma, article, english").in("lemma", lemmas);
  if (error) throw error;
  return data.map((r) => ({ lemma: r.lemma as string, article: r.article as string | null, english: r.english as string[] }));
}
