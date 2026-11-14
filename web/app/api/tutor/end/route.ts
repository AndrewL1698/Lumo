import { EndRequest, Recap, recapFixture } from "@parrot/shared";
import { json, parseBody } from "@/lib/http";
import { NextResponse } from "next/server";

// TODO(andrew): build recap (lib/claude.ts writeRecap) and commit learner updates.
export async function POST(req: Request) {
  const body = await parseBody(req, EndRequest);
  if (body instanceof NextResponse) return body;
  return json(recapFixture, Recap);
}
