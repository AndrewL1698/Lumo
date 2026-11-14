import { SttTokenResponse, sttTokenResponseFixture } from "@parrot/shared";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// TODO(andrew): mint a single-use realtime token via lib/elevenlabs.ts mintSttToken().
export async function GET() {
  return json(sttTokenResponseFixture, SttTokenResponse);
}
