import { ApiError, PairRequest, PairResponse } from "@parrot/shared";
import { DEMO_EXTENSION_TOKEN } from "@/lib/auth";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// HACK: one hard-coded demo code (matches Shravan's onboarding page); the token is static (lib/auth.ts).
// `pair_codes` is unused this weekend.
const DEMO_PAIR_CODE = "482913";

export async function POST(req: Request) {
  const body = await parseBody(req, PairRequest);
  if (body instanceof NextResponse) return withCors(body);
  if (body.code !== DEMO_PAIR_CODE) {
    return withCors(json({ error: "invalid pairing code" }, ApiError, { status: 401 }));
  }
  return withCors(json({ token: DEMO_EXTENSION_TOKEN }, PairResponse));
}
