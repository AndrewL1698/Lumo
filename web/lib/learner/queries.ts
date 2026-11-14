// Read helpers for routes and Andrew's /api/tutor/context (brief 3.5). Relative imports only (tsx from /scripts, /eval).
import { Recap, Settings, settingsFixture } from "@parrot/shared";
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
  // Dedupe: a mismatched articleKey for the same page would otherwise list its title twice.
  return [...new Set(data.map((r) => r.title as string | null).filter((t): t is string => !!t))];
}

/** Word-list details so the route can build TargetWords without another query. `english` is "; "-joined. */
export type WordInfo = { article: string | null; english: string; cognate: boolean };

export type TutorContextData = {
  level: Settings["level"];
  /** Last 24h, newest first, one per lemma. hoveredAt/articleTitle are for J2's "hovered at 9:12 in …". */
  hoveredWords: ({ lemma: string; sentence?: string; hoveredAt: string; articleTitle?: string } & WordInfo)[];
  /** Most overdue first. */
  dueWords: ({ lemma: string; dueAt: string } & WordInfo)[];
  /** Today's article titles; [] when Settings.useReadingInLessons is off. */
  articleTitles: string[];
  /** From the latest tutor session recap, e.g. `agreement: "la problema" → "el problema" (3×)`. */
  topErrors: string[];
};

/** The most recent tutor session recap that parses, or null. */
export async function latestRecap(userId: string): Promise<Recap | null> {
  const { data, error } = await getDb()
    .from("tutor_sessions")
    .select("recap")
    .eq("user_id", userId)
    .not("recap", "is", null)
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const parsed = Recap.safeParse(data[0]?.recap);
  return parsed.success ? parsed.data : null;
}

/** topErrors of the latest recap, formatted for the tutor prompt. */
export async function latestTopErrors(userId: string): Promise<string[]> {
  const recap = await latestRecap(userId);
  return (recap?.topErrors ?? []).map((e) => `${e.type}: "${e.span}" → "${e.correction}" (${e.count}×)`);
}

/**
 * Words the learner recently got wrong in speech, for `onWeakList` (brief 3.1): every word in the latest recap's
 * error spans and corrections, lowercased. TODO(karthik): also read utterances.correction once Andrew writes it.
 */
export async function weakWords(userId: string): Promise<Set<string>> {
  const recap = await latestRecap(userId);
  const words = new Set<string>();
  for (const e of recap?.topErrors ?? []) {
    for (const w of `${e.span} ${e.correction}`.toLowerCase().split(/[^\p{L}]+/u)) if (w) words.add(w);
  }
  return words;
}

/** Everything Andrew's /api/tutor/context needs from the DB, in one call. Throws on DB error. */
export async function getTutorContextData(
  userId: string,
  opts: { now?: Date; maxHovers?: number; maxDue?: number } = {},
): Promise<TutorContextData> {
  const { now = new Date(), maxHovers = 10, maxDue = 20 } = opts;
  const db = getDb();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [settings, topErrors, hovers, due] = await Promise.all([
    getSettings(userId),
    latestTopErrors(userId),
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

  // Word details for hovered + due lemmas in one query.
  const lemmas = [...new Set([...latest.keys(), ...due.data.map((r) => r.lemma as string)])];
  const info = new Map<string, WordInfo>();
  if (lemmas.length) {
    const words = await db.from("words").select("lemma, article, english, cognate").in("lemma", lemmas);
    if (words.error) throw words.error;
    for (const w of words.data) {
      info.set(w.lemma as string, {
        article: w.article as string | null,
        english: (w.english as string[]).join("; "),
        cognate: w.cognate as boolean,
      });
    }
  }
  const infoOf = (lemma: string): WordInfo => info.get(lemma) ?? { article: null, english: "", cognate: false };

  const hoveredWords = [...latest.values()].map((h) => {
    const lemma = h.lemma as string;
    const sentence = (h.meta as { sentence?: unknown } | null)?.sentence;
    const articleTitle = titles.get(h.article_key as string);
    return {
      lemma,
      hoveredAt: new Date(h.ts as string).toISOString(),
      ...(typeof sentence === "string" && { sentence }),
      ...(articleTitle && { articleTitle }),
      ...infoOf(lemma),
    };
  });

  return {
    level: settings.level,
    hoveredWords,
    dueWords: due.data.map((r) => ({
      lemma: r.lemma as string,
      dueAt: new Date(r.due_at as string).toISOString(),
      ...infoOf(r.lemma as string),
    })),
    articleTitles: settings.useReadingInLessons ? await todaysArticleTitles(userId, now) : [],
    topErrors,
  };
}

/** Dictionary details for a list of lemmas (unknown lemmas are omitted). */
export async function wordDetails(lemmas: string[]): Promise<{ lemma: string; article: string | null; english: string[] }[]> {
  if (lemmas.length === 0) return [];
  const { data, error } = await getDb().from("words").select("lemma, article, english").in("lemma", lemmas);
  if (error) throw error;
  return data.map((r) => ({ lemma: r.lemma as string, article: r.article as string | null, english: r.english as string[] }));
}
