import { ApiError, EventsResponse, ExtensionEvent } from "@parrot/shared";
import { checkExtensionToken } from "@/lib/auth";
import { DEMO_USER_ID } from "@/lib/config";
import { errText, getDb } from "@/lib/db";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { applyEvents } from "@/lib/learner/record";
import { isNeverListed } from "@/lib/neverlist";
import { NextResponse } from "next/server";
import { z } from "zod";

export const OPTIONS = preflight;

// Validate each event on its own, so one malformed event can't make the extension's queue retry the whole batch
// forever (a "poison" event). Same request shape as EventsRequest; invalid events are logged and dropped.
const Envelope = z.object({ events: z.array(z.unknown()).min(1) });
const REPEAT_READING_MS = 60 * 60 * 1000;

// Every request is DEMO_USER_ID; the extension token is required.
// Dropped events (invalid, never-list, repeat "reading" within the hour) count as accepted so the extension
// doesn't retry them. Never-list (4.2): a reading from a never-list domain drops every event in the batch on
// that article.
export async function POST(req: Request) {
  const denied = checkExtensionToken(req);
  if (denied) return denied;
  const body = await parseBody(req, Envelope);
  if (body instanceof NextResponse) {
    console.warn("[api/events] rejected batch: not { events: [...] }");
    return withCors(body);
  }

  const userId = DEMO_USER_ID;
  const total = body.events.length;
  const valid: ExtensionEvent[] = [];
  let invalid = 0;
  for (const raw of body.events) {
    const parsed = ExtensionEvent.safeParse(raw);
    if (parsed.success) valid.push(parsed.data);
    else {
      invalid++;
      const type = (raw as { type?: unknown } | null)?.type;
      console.warn(`[api/events] dropped invalid event (type=${String(type)}):`, z.prettifyError(parsed.error).replace(/\n/g, " "));
    }
  }

  const all = [...new Map(valid.map((e) => [e.id, e])).values()];
  const blockedKeys = new Set(
    all.filter((e) => e.type === "reading" && e.meta?.domain && isNeverListed(e.meta.domain)).map((e) => e.articleKey),
  );
  let unique = all.filter((e) => !blockedKeys.has(e.articleKey));
  const blocked = all.length - unique.length;
  const db = getDb();

  // One "reading" per article per hour: the extension sends one on every page load.
  let repeats = 0;
  const readingKeys = [...new Set(unique.filter((e) => e.type === "reading").map((e) => e.articleKey))];
  if (readingKeys.length) {
    const recent = await db
      .from("events")
      .select("article_key")
      .eq("user_id", userId)
      .eq("type", "reading")
      .in("article_key", readingKeys)
      .gte("ts", new Date(Date.now() - REPEAT_READING_MS).toISOString());
    const seenKeys = new Set((recent.data ?? []).map((r) => r.article_key as string));
    const keep = new Set<string>();
    const before = unique.length;
    unique = unique.filter((e) => {
      if (e.type !== "reading") return true;
      if (seenKeys.has(e.articleKey) || keep.has(e.articleKey)) return false;
      keep.add(e.articleKey);
      return true;
    });
    repeats = before - unique.length;
  }

  const dropped = invalid + blocked + repeats;
  if (unique.length === 0) {
    console.log(`[api/events] stored nothing; dropped invalid=${invalid} never-list=${blocked} repeat-reading=${repeats}`);
    return withCors(json({ accepted: dropped, duplicates: total - dropped }, EventsResponse));
  }

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
    console.error("[api/events] insert failed:", errText(error));
    return withCors(json({ error: "could not store events" }, ApiError, { status: 500 }));
  }

  const insertedIds = new Set(inserted.map((r) => r.id as string));
  const fresh = unique.filter((e) => insertedIds.has(e.id));

  try {
    // Only readings with a title become articles; a title-less reading would show as a blank row on "What Lumo knows".
    const reading = fresh.filter((e) => e.type === "reading" && e.meta?.title);
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
    console.error("[api/events] learner update failed:", errText(err));
  }

  const counts = fresh.reduce<Record<string, number>>((c, e) => ((c[e.type] = (c[e.type] ?? 0) + 1), c), {});
  console.log(`[api/events] stored ${JSON.stringify(counts)}; dropped invalid=${invalid} never-list=${blocked} repeat-reading=${repeats}`);
  return withCors(json({ accepted: insertedIds.size + dropped, duplicates: total - insertedIds.size - dropped }, EventsResponse));
}
