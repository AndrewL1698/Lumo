import { TurnTimeline } from "@parrot/shared";
import { parseBody } from "@/lib/http";
import { NextResponse } from "next/server";

// TODO(andrew): append the turn timeline to eval/latency/turns.jsonl (or the DB).
export async function POST(req: Request) {
  const body = await parseBody(req, TurnTimeline);
  if (body instanceof NextResponse) return body;
  return new Response(null, { status: 204 });
}
