import { TtsRequest } from "@parrot/shared";
import { parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// TODO(andrew): ElevenLabs Flash v2.5 via lib/elevenlabs.ts → audio/mpeg; cache hover-card audio by lemma.
export async function POST(req: Request) {
  const body = await parseBody(req, TtsRequest);
  if (body instanceof NextResponse) return withCors(body);
  return withCors(NextResponse.json({ error: "not implemented" }, { status: 501 }));
}
