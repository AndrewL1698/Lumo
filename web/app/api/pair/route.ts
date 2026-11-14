import { ApiError, PairRequest, PairResponse } from "@parrot/shared";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// HACK: one hard-coded demo code (matches Shravan's onboarding page) and a static token for
// DEMO_USER_ID (architecture §11 #15). `pair_codes` is unused this weekend.
const DEMO_PAIR_CODE = "482913";
const DEMO_EXTENSION_TOKEN = "demo-extension-token";

export async function POST(req: Request) {
  const body = await parseBody(req, PairRequest);
  if (body instanceof NextResponse) return withCors(body);
  if (body.code !== DEMO_PAIR_CODE) {
    return withCors(json({ error: "invalid pairing code" }, ApiError, { status: 401 }));
  }
  return withCors(json({ token: DEMO_EXTENSION_TOKEN }, PairResponse));
}
