import { ApiError, Settings, settingsFixture } from "@parrot/shared";
import { DEMO_USER_ID } from "@/lib/config";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { getSettings, putSettings } from "@/lib/learner/queries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET() {
  try {
    return withCors(json(await getSettings(DEMO_USER_ID), Settings));
  } catch (err) {
    // Degrade: the web app and extension keep working on defaults.
    console.error("[api/settings] read failed", err);
    return withCors(json(settingsFixture, Settings));
  }
}

// PUT takes the full object. TODO(karthik): 4.2 reject never-list domains in allowlist.
export async function PUT(req: Request) {
  const body = await parseBody(req, Settings);
  if (body instanceof NextResponse) return withCors(body);
  try {
    await putSettings(DEMO_USER_ID, body);
  } catch (err) {
    console.error("[api/settings] write failed", err);
    return withCors(json({ error: "could not save settings" }, ApiError, { status: 500 }));
  }
  return withCors(json(body, Settings));
}
