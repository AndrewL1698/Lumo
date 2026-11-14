import { ApiError, EventsRequest, EventsResponse } from "@parrot/shared";
import { checkExtensionToken } from "@/lib/auth";
import { DEMO_USER_ID } from "@/lib/config";
import { getDb } from "@/lib/db";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { applyEvents } from "@/lib/learner/record";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// Every request is DEMO_USER_ID; the extension token is required.
// TODO(karthik): 4.2 never-list check on reading events' meta.domain.
export async function POST(req: Request) {
  const denied = checkExtensionToken(req);
  if (denied) return denied;
  const body = await parseBody(req, EventsRequest);
  if (body instanceof NextResponse) return withCors(body);

  const userId = DEMO_USER_ID;
  const unique = [...new Map(body.events.map((e) => [e.id, e])).values()];
  const db = getDb();

  // Idempotent insert: on conflict (id) do nothing. Only newly inserted rows come back.
  const { data: inserted, error } = await db
    .from("events")
    .upsert(
      unique.map((e) => ({
        id: e.id,
        user_id: userId,
        type: e.type,
        lemma: e.lemma ?? null,
        article_key: e.articleKey,
        ts: new Date(e.ts).toISOString(),
        meta: e.meta ?? null, // meta.sentence = hover sentence
      })),
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("[api/events] insert failed", error);
    return withCors(json({ error: "could not store events" }, ApiError, { status: 500 }));
  }

  const insertedIds = new Set(inserted.map((r) => r.id as string));
  const fresh = unique.filter((e) => insertedIds.has(e.id));

  try {
    const reading = fresh.filter((e) => e.type === "reading");
    if (reading.length) {
      const articles = [...new Map(reading.map((e) => [e.articleKey, e])).values()].map((e) => ({
        user_id: userId,
        article_key: e.articleKey,
        title: e.meta?.title ?? null,
        domain: e.meta?.domain ?? null,
        ts: new Date(e.ts).toISOString(),
      }));
      const res = await db.from("articles").upsert(articles, { onConflict: "user_id,article_key" });
      if (res.error) throw res.error;
    }
    await applyEvents(userId, fresh);
  } catch (err) {
    // TODO(demo): the events are stored but not applied; a retry now counts them as duplicates.
    console.error("[api/events] learner update failed", err);
  }

  return withCors(json({ accepted: insertedIds.size, duplicates: body.events.length - insertedIds.size }, EventsResponse));
}
