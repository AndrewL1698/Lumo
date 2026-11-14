import { Settings, settingsFixture } from "@parrot/shared";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// TODO(karthik): read settings for DEMO_USER_ID from the DB.
export async function GET() {
  return withCors(json(settingsFixture, Settings));
}

// TODO(karthik): persist settings; for now echo the validated body.
export async function PUT(req: Request) {
  const body = await parseBody(req, Settings);
  if (body instanceof NextResponse) return withCors(body);
  return withCors(json(body, Settings));
}
