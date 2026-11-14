// DB side of the learner model: load user_words, run applyEvent, save. Used by /api/events and the tutor.
import { randomUUID } from "node:crypto";
import type { TutorEventType, WordState } from "@parrot/shared";
import { getDb } from "../db";
import { applyEvent } from "./applyEvent";
import { rowToUserWord, USER_WORD_COLUMNS, userWordToRow } from "./rows";
import { emptyUserWord, type LearnerEvent, type UserWord } from "./types";

export type StateChange = { from: WordState; to: WordState };

/**
 * Apply already-stored events to user_words. Events are applied per lemma in `ts` order.
 * Lemmas not in `words` are skipped (FK). `reading` events don't touch user_words.
 * Returns the state change per lemma that was updated.
 */
export async function applyEvents(userId: string, events: LearnerEvent[]): Promise<Map<string, StateChange>> {
  const changes = new Map<string, StateChange>();
  const wordEvents = events.filter((e) => e.lemma && e.type !== "reading");
  const lemmas = [...new Set(wordEvents.map((e) => e.lemma as string))];
  if (lemmas.length === 0) return changes;

  const db = getDb();
  const [known, existing] = await Promise.all([
    db.from("words").select("lemma").in("lemma", lemmas),
    db.from("user_words").select(USER_WORD_COLUMNS).eq("user_id", userId).in("lemma", lemmas),
  ]);
  if (known.error) throw known.error;
  if (existing.error) throw existing.error;

  const inList = new Set(known.data.map((r) => r.lemma as string));
  const current = new Map<string, UserWord>(existing.data.map((r) => [r.lemma, rowToUserWord(r)]));

  for (const e of [...wordEvents].sort((a, b) => a.ts - b.ts)) {
    const lemma = e.lemma as string;
    if (!inList.has(lemma)) continue;
    const before = current.get(lemma) ?? emptyUserWord(lemma);
    const after = applyEvent(before, e);
    current.set(lemma, after);
    const prev = changes.get(lemma);
    changes.set(lemma, { from: prev?.from ?? before.state, to: after.state });
  }

  const rows = [...changes.keys()].map((l) => userWordToRow(userId, current.get(l) as UserWord));
  if (rows.length) {
    const { error } = await db.from("user_words").upsert(rows, { onConflict: "user_id,lemma" });
    if (error) throw error;
  }
  return changes;
}

/**
 * For Andrew's /api/tutor/correct: record a spoken_correct / spoken_incorrect for one lemma.
 * Writes an `events` row (article_key null), updates user_words, and returns the state change.
 * A lemma outside the word list is still logged as an event but returns from === to (no WordUpdate).
 */
export async function recordTutorEvent(userId: string, lemma: string, type: TutorEventType): Promise<StateChange> {
  const now = Date.now();
  const event: LearnerEvent = { id: randomUUID(), type, lemma, articleKey: "", ts: now };
  const { error } = await getDb()
    .from("events")
    .insert({ id: event.id, user_id: userId, type, lemma, article_key: null, ts: new Date(now).toISOString(), meta: null });
  if (error) throw error;

  const change = (await applyEvents(userId, [event])).get(lemma);
  return change ?? { from: "new", to: "new" };
}
