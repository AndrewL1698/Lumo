import { EventsRequest, EventsResponse, eventsResponseFixture } from "@parrot/shared";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// TODO(karthik): idempotent insert by event id → learner model + FSRS.
export async function POST(req: Request) {
  const body = await parseBody(req, EventsRequest);
  if (body instanceof NextResponse) return withCors(body);
  return withCors(json(eventsResponseFixture, EventsResponse));
}
