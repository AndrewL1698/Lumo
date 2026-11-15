import { ApiError, Settings, settingsFixture } from "@parrot/shared";
import { checkExtensionToken } from "@/lib/auth";
import { DEMO_USER_ID } from "@/lib/config";
import { errText } from "@/lib/db";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { getSettings, putSettings } from "@/lib/learner/queries";
import { isNeverListed } from "@/lib/neverlist";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Web pages call without a token; the extension sends one. A wrong token is rejected.
export async function GET(req: Request) {
  const denied = checkExtensionToken(req, { optional: true });
  if (denied) return denied;
  try {
    return withCors(json(await getSettings(DEMO_USER_ID), Settings));
  } catch (err) {
    // Degrade: the web app and extension keep working on defaults.
    console.error("[api/settings] read failed:", errText(err));
    return withCors(json(settingsFixture, Settings));
  }
}

// PUT takes the full object. Never-list domains can't be allowlisted (4.2).
export async function PUT(req: Request) {
  const denied = checkExtensionToken(req, { optional: true });
  if (denied) return denied;
  const body = await parseBody(req, Settings);
  if (body instanceof NextResponse) return withCors(body);
  const forbidden = body.allowlist.filter(isNeverListed);
  if (forbidden.length) {
    return withCors(json({ error: `Lumo never runs on: ${forbidden.join(", ")}` }, ApiError, { status: 400 }));
  }
  try {
    await putSettings(DEMO_USER_ID, body);
  } catch (err) {
    console.error("[api/settings] write failed:", errText(err));
    return withCors(json({ error: "could not save settings" }, ApiError, { status: 500 }));
  }
  return withCors(json(body, Settings));
}
