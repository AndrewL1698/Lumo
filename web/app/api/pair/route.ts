import { randomInt } from "node:crypto";
import { ApiError, PairCodeResponse, PairRequest, PairResponse, PairStatusResponse } from "@parrot/shared";
import { DEMO_EXTENSION_TOKEN } from "@/lib/auth";
import { errText, getDb } from "@/lib/db";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;
export const dynamic = "force-dynamic";

// HACK(demo): hidden stage fallback, always accepted, and what onboarding shows if the DB is down.
// The token is still the one static demo token (lib/auth.ts); the codes in `pair_codes` are real and one-time.
const DEMO_PAIR_CODE = "482913";
const CODE_TTL_MS = 15 * 60 * 1000;

// GET /api/pair          → a fresh one-time code for onboarding to show.
// GET /api/pair?code=X   → { paired } : true once the extension has used X (its row is deleted on use).
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (code) {
    if (code === DEMO_PAIR_CODE) return json({ paired: false }, PairStatusResponse);
    try {
      const { data, error } = await getDb().from("pair_codes").select("code").eq("code", code).maybeSingle();
      if (error) throw error;
      return json({ paired: data === null }, PairStatusResponse);
    } catch (err) {
      console.error("[api/pair] status failed:", errText(err));
      return json({ paired: false }, PairStatusResponse);
    }
  }

  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  try {
    const db = getDb();
    // Sweep expired codes so the table stays tiny.
    await db.from("pair_codes").delete().lt("expires_at", new Date().toISOString());
    for (let tries = 0; tries < 3; tries++) {
      const fresh = String(randomInt(100000, 1000000));
      if (fresh === DEMO_PAIR_CODE) continue;
      const { error } = await db.from("pair_codes").insert({ code: fresh, token: DEMO_EXTENSION_TOKEN, expires_at: expiresAt });
      if (!error) return json({ code: fresh, expiresAt }, PairCodeResponse);
      if (error.code !== "23505") throw error; // anything but a duplicate code
    }
    throw new Error("no free code after 3 tries");
  } catch (err) {
    console.error("[api/pair] could not create a code:", errText(err));
    return json({ code: DEMO_PAIR_CODE, expiresAt }, PairCodeResponse);
  }
}

export async function POST(req: Request) {
  const body = await parseBody(req, PairRequest);
  if (body instanceof NextResponse) return withCors(body);
  if (body.code === DEMO_PAIR_CODE) return withCors(json({ token: DEMO_EXTENSION_TOKEN }, PairResponse));

  try {
    // Delete-and-return in one call, so a code works exactly once.
    const { data, error } = await getDb()
      .from("pair_codes")
      .delete()
      .eq("code", body.code)
      .gt("expires_at", new Date().toISOString())
      .select("token");
    if (error) throw error;
    const token = data?.[0]?.token as string | undefined;
    if (token) return withCors(json({ token }, PairResponse));
  } catch (err) {
    console.error("[api/pair] pair failed:", errText(err));
    return withCors(json({ error: "pairing is unavailable right now" }, ApiError, { status: 500 }));
  }
  return withCors(json({ error: "invalid pairing code" }, ApiError, { status: 401 }));
}
