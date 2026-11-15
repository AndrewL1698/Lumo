import { TtsRequest, type ApiError } from "@parrot/shared";
import { ELEVENLABS, isTutorMock } from "@/lib/config";
import { ttsChunk } from "@/lib/elevenlabs";
import { parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

/** A non-2xx here means "captions only": the client skips the audio for this chunk. */
function unavailable(): NextResponse {
  const body: ApiError = { error: "tts unavailable" };
  return withCors(
    NextResponse.json(body, { status: 502, headers: { "Cache-Control": "no-store" } }),
  );
}

/** Flash v2.5 audio for one chunk (tutor speech or a hover-card lemma). ttsChunk caches by text on disk. */
export async function POST(req: Request) {
  const body = await parseBody(req, TtsRequest);
  if (body instanceof NextResponse) return withCors(body);
  if (isTutorMock()) return unavailable(); // no ElevenLabs calls in mock mode
  try {
    // Tutor speech sends the learner's level; hover-card words send none and play at the normal pace.
    const audio = await ttsChunk(body.text, { speed: body.level ? ELEVENLABS.ttsSpeed[body.level] : 1 });
    return withCors(
      new NextResponse(audio, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      }),
    );
  } catch (err) {
    console.error(`[api/tts] ${err instanceof Error ? err.message : "unknown error"}`);
    return unavailable();
  }
}
