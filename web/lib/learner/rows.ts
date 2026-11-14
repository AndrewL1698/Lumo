// DB boundary: snake_case Postgres rows ↔ camelCase /shared types. Map here, nowhere else.
import { UserWord, type Level } from "@parrot/shared";

/** `words.band` is smallint 1–3 in the DB; /shared uses the Level string. */
const BAND_TO_LEVEL: Record<number, Level> = { 1: "beginner", 2: "intermediate", 3: "upper_intermediate" };
export const bandToLevel = (band: number): Level => BAND_TO_LEVEL[band] ?? "beginner";
export const levelToBand = (level: Level): number => ({ beginner: 1, intermediate: 2, upper_intermediate: 3 })[level];

export type UserWordRow = {
  user_id: string;
  lemma: string;
  state: string;
  fsrs_card: Record<string, unknown> | null;
  seen_count: number;
  seen_articles: string[];
  last_hover_at: string | null;
  due_at: string | null;
};

export const USER_WORD_COLUMNS = "lemma, state, fsrs_card, seen_count, seen_articles, last_hover_at, due_at";

// Postgres returns "2026-11-14T12:00:00+00:00"; IsoDate wants an offset, which that has, but normalise anyway.
const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);

export function rowToUserWord(row: Omit<UserWordRow, "user_id">): UserWord {
  return UserWord.parse({
    lemma: row.lemma,
    state: row.state,
    fsrsCard: row.fsrs_card,
    seenCount: row.seen_count,
    seenArticles: row.seen_articles ?? [],
    lastHoverAt: iso(row.last_hover_at),
    dueAt: iso(row.due_at),
  });
}

export function userWordToRow(userId: string, w: UserWord): UserWordRow {
  return {
    user_id: userId,
    lemma: w.lemma,
    state: w.state,
    fsrs_card: w.fsrsCard,
    seen_count: w.seenCount,
    seen_articles: w.seenArticles,
    last_hover_at: w.lastHoverAt,
    due_at: w.dueAt,
  };
}
