import {
  ApiError,
  DataDeleteRequest,
  DataDeleteResponse,
  DataResponse,
  LearnerEventType,
  type StoredArticle,
  type StoredEvent,
} from "@parrot/shared";
import { DEMO_USER_ID } from "@/lib/config";
import { getDb } from "@/lib/db";
import { json, parseBody } from "@/lib/http";
import { rowToUserWord, USER_WORD_COLUMNS } from "@/lib/learner/rows";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const iso = (v: string) => new Date(v).toISOString();

// Everything Parrot stores for the user ("What Parrot knows").
export async function GET() {
  try {
    const db = getDb();
    const [words, events, articles] = await Promise.all([
      db.from("user_words").select(USER_WORD_COLUMNS).eq("user_id", DEMO_USER_ID).order("lemma"),
      db
        .from("events")
        .select("id, type, lemma, article_key, ts")
        .eq("user_id", DEMO_USER_ID)
        .order("ts", { ascending: false })
        .limit(500), // HACK: newest 500 is plenty for the demo
      db.from("articles").select("id, article_key, title, domain, ts").eq("user_id", DEMO_USER_ID).order("ts", { ascending: false }),
    ]);
    if (words.error) throw words.error;
    if (events.error) throw events.error;
    if (articles.error) throw articles.error;

    const storedEvents: StoredEvent[] = events.data
      .filter((e) => LearnerEventType.safeParse(e.type).success)
      .map((e) => ({ id: e.id, type: e.type, lemma: e.lemma, articleKey: e.article_key, ts: iso(e.ts) }));
    const storedArticles: StoredArticle[] = articles.data.map((a) => ({
      id: a.id,
      articleKey: a.article_key,
      title: a.title ?? "",
      domain: a.domain ?? "",
      ts: iso(a.ts),
    }));
    return json({ words: words.data.map(rowToUserWord), events: storedEvents, articles: storedArticles }, DataResponse);
  } catch (err) {
    console.error("[api/data] read failed", err);
    return json({ error: "could not load your data" }, ApiError, { status: 500 });
  }
}

// Delete one word/event/article, or everything (settings are kept).
export async function DELETE(req: Request) {
  const body = await parseBody(req, DataDeleteRequest);
  if (body instanceof NextResponse) return body;
  const db = getDb();
  const del = async (table: string, filter: Record<string, string>) => {
    let q = db.from(table).delete({ count: "exact" }).eq("user_id", DEMO_USER_ID);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };

  try {
    let deleted = 0;
    if (body.kind === "word") deleted = await del("user_words", { lemma: body.lemma });
    else if (body.kind === "event") deleted = await del("events", { id: body.id });
    else if (body.kind === "article") deleted = await del("articles", { id: body.id });
    else {
      // Utterances go with their tutor session (on delete cascade); count them first.
      const sessions = await db.from("tutor_sessions").select("id").eq("user_id", DEMO_USER_ID);
      if (sessions.error) throw sessions.error;
      const ids = sessions.data.map((s) => s.id as string);
      if (ids.length) {
        const utt = await db.from("utterances").select("id", { count: "exact", head: true }).in("session_id", ids);
        if (utt.error) throw utt.error;
        deleted += utt.count ?? 0;
      }
      for (const table of ["user_words", "events", "articles", "tutor_sessions"]) deleted += await del(table, {});
    }
    return json({ deleted }, DataDeleteResponse);
  } catch (err) {
    // Privacy page: never pretend a delete worked.
    console.error("[api/data] delete failed", err);
    return json({ error: "could not delete" }, ApiError, { status: 500 });
  }
}
