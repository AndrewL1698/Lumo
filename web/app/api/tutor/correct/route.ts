import { CorrectRequest, CorrectResponse, correctResponseFixture } from "@parrot/shared";
import { json, parseBody } from "@/lib/http";
import { NextResponse } from "next/server";

// TODO(andrew): lib/claude.ts correctUtterance() → drop non-substring spans → word updates.
export async function POST(req: Request) {
  const body = await parseBody(req, CorrectRequest);
  if (body instanceof NextResponse) return body;
  return json(correctResponseFixture, CorrectResponse);
}
