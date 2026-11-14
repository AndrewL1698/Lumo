import { TranslateRequest, TranslateResponse, translateResponseFixture } from "@parrot/shared";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// TODO(karthik): batch in-context translation via lib/claude.ts (Haiku), cached by (lemma, sense).
export async function POST(req: Request) {
  const body = await parseBody(req, TranslateRequest);
  if (body instanceof NextResponse) return withCors(body);
  return withCors(json(translateResponseFixture, TranslateResponse));
}
