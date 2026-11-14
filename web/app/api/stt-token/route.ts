import { ApiError, SttTokenResponse, sttTokenResponseFixture } from "@parrot/shared";
import { ELEVENLABS, isTutorMock } from "@/lib/config";
import { mintSttToken } from "@/lib/elevenlabs";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Single-use realtime STT token. `?model=` is honoured only for the STT-test candidates. */
export async function GET(req: Request) {
  if (isTutorMock()) return json(sttTokenResponseFixture, SttTokenResponse);

  const asked = new URL(req.url).searchParams.get("model");
  const candidates: readonly string[] = ELEVENLABS.sttRealtimeCandidates;
  const model = asked && candidates.includes(asked) ? asked : ELEVENLABS.sttRealtimeModel;

  try {
    return json({ token: await mintSttToken(), model }, SttTokenResponse);
  } catch (err) {
    console.error(`[stt-token] ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "could not get a speech-to-text token" }, ApiError, { status: 502 });
  }
}
