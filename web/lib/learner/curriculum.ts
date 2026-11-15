// The learner's place in the course (D-022): computed from word states and session recaps. Read-only.
// A unit is done when 60% of its words are known/mastered (active evidence, §6.1) AND a session passed its checkpoint.
import { LessonMemory, type ProgressResponse, type ProgressUnit, type WordState } from "@parrot/shared";
import { LEVEL_TITLE, trackOf, type Unit } from "../curriculum/units";
import { getDb } from "../db";
import { getSettings } from "./queries";

export const DONE_SHARE = 0.6;
const SOLID = new Set<WordState>(["known", "mastered"]);

/** Every session's lesson memory, newest first. Sessions without one (or with a bad one) are skipped. */
async function lessonMemories(userId: string): Promise<LessonMemory[]> {
  const { data, error } = await getDb()
    .from("tutor_sessions")
    .select("recap")
    .eq("user_id", userId)
    .not("recap", "is", null)
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  const out: LessonMemory[] = [];
  for (const row of data) {
    const parsed = LessonMemory.safeParse((row.recap as { lesson?: unknown } | null)?.lesson);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** The unit's words with the learner's state for each (never-seen words count as "new"). */
async function wordStates(userId: string, lemmas: string[]): Promise<Map<string, WordState>> {
  const { data, error } = await getDb().from("user_words").select("lemma, state").eq("user_id", userId).in("lemma", lemmas);
  if (error) throw error;
  return new Map(data.map((r) => [r.lemma as string, r.state as WordState]));
}

/** Dictionary info for a unit word, in the shape pickTargetWords reads. */
export type UnitWordInfo = { lemma: string; article: string | null; english: string; cognate: boolean; state: WordState };

/** What the tutor needs about today's unit (D-022). Attached to TutorContextData by the context route. */
export type LessonData = {
  unit: Unit;
  position: string; // "Intermediate · Unit 1 of 4"
  words: UnitWordInfo[];
  lastLesson: LessonMemory | null;
};

/** "Intermediate · Unit 1 of 4"; beginner's Unit 0 reads "Beginner · First words". */
export function positionOf(unit: Unit, units: Unit[]): string {
  const title = LEVEL_TITLE[unit.level];
  if (unit.order === 0) return `${title} · First words`;
  return `${title} · Unit ${unit.order} of ${units.filter((u) => u.order >= 1).length}`;
}

/** The current unit with dictionary info for its words, or null when the track is finished. Throws on a DB error. */
export async function lessonData(userId: string): Promise<LessonData | null> {
  const { units, progress } = await computeTrack(userId);
  const unit = units.find((u) => u.id === progress.currentUnitId);
  if (!unit) return null;
  const { data, error } = await getDb().from("words").select("lemma, article, english, cognate").in("lemma", unit.words);
  if (error) throw error;
  const info = new Map(data.map((r) => [r.lemma as string, r]));
  const states = new Map(progress.units.find((u) => u.id === unit.id)?.words.map((w) => [w.lemma, w.state]));
  const words: UnitWordInfo[] = unit.words.flatMap((lemma) => {
    const r = info.get(lemma);
    if (!r) return [];
    return [
      {
        lemma,
        article: (r.article as string | null) ?? null,
        english: ((r.english as string[])[0] ?? "").trim(),
        cognate: Boolean(r.cognate),
        state: states.get(lemma) ?? "new",
      },
    ];
  });
  return { unit, position: positionOf(unit, units), words, lastLesson: progress.lastLesson };
}

export type Track = { level: ProgressResponse["level"]; units: Unit[]; progress: ProgressResponse };

/** Throws on a DB error: routes degrade to the fixture, the tutor context to "no lesson". */
export async function computeTrack(userId: string): Promise<Track> {
  const settings = await getSettings(userId);
  const units = trackOf(settings.level);
  const [memories, states] = await Promise.all([
    lessonMemories(userId),
    wordStates(userId, [...new Set(units.flatMap((u) => u.words))]),
  ]);
  const passed = new Set(memories.filter((m) => m.checkpointPassed).map((m) => m.unitId));

  let currentUnitId: string | null = null;
  const rows: ProgressUnit[] = units.map((u) => {
    const words = u.words.map((lemma) => ({ lemma, state: states.get(lemma) ?? ("new" as WordState) }));
    const wordsKnown = words.filter((w) => SOLID.has(w.state)).length;
    const checkpointPassed = passed.has(u.id);
    const done = wordsKnown / words.length >= DONE_SHARE && checkpointPassed;
    if (!done && currentUnitId === null) currentUnitId = u.id;
    return {
      id: u.id,
      order: u.order,
      title: u.title,
      canDo: u.canDo,
      concept: u.concept.name,
      status: done ? "done" : u.id === currentUnitId ? "current" : "locked",
      wordsKnown,
      wordsTotal: words.length,
      checkpointPassed,
      words,
    };
  });

  const progress: ProgressResponse = {
    level: settings.level,
    levelTitle: LEVEL_TITLE[settings.level],
    units: rows,
    currentUnitId,
    lastLesson: memories[0] ?? null,
  };
  return { level: settings.level, units, progress };
}
