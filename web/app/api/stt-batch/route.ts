import { ApiError, rawTextFixture, SttBatchResponse } from "@parrot/shared";
import { isTutorMock, TUTOR } from "@/lib/config";
import { sttBatch } from "@/lib/elevenlabs";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_SECONDS = 40; // maxHoldMs is 30 s; a little slack for the tail
const MAX_PCM_BYTES = MAX_SECONDS * TUTOR.sampleRate * 2;

const bad = (error: string) => json({ error }, ApiError, { status: 400 });

/** Walk the RIFF chunks (no 44-byte assumption). Returns the raw PCM bytes or an error message. */
function wavToPcm(buf: ArrayBuffer): ArrayBuffer | string {
  const v = new DataView(buf);
  const tag = (o: number) =>
    String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
    return "body must be a WAV file";

  let fmtOk = false;
  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const start = off + 8;
    if (id === "fmt ") {
      if (size < 16 || start + 16 > buf.byteLength) return "bad WAV fmt chunk";
      const format = v.getUint16(start, true);
      const channels = v.getUint16(start + 2, true);
      const rate = v.getUint32(start + 4, true);
      const bits = v.getUint16(start + 14, true);
      if (format !== 1 || channels !== 1 || rate !== TUTOR.sampleRate || bits !== 16) {
        return "WAV must be 16 kHz mono 16-bit PCM";
      }
      fmtOk = true;
    } else if (id === "data") {
      if (!fmtOk) return "WAV fmt chunk missing";
      // Streamed WAVs may write 0 or 0xFFFFFFFF as the size: take what is actually there.
      let len = Math.min(size, buf.byteLength - start);
      len -= len % 2;
      if (len === 0) return "WAV has no audio";
      if (len > MAX_PCM_BYTES) return `audio is longer than ${MAX_SECONDS} s`;
      return buf.slice(start, start + len);
    }
    off = start + size + (size % 2); // chunks are word-aligned
  }
  return "WAV data chunk missing";
}

/** Batch STT fallback: audio/wav (16 kHz mono 16-bit) → { text }, the transcript exactly as ElevenLabs returned it. */
export async function POST(req: Request) {
  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch {
    return bad("could not read the request body");
  }
  const pcm = wavToPcm(body);
  if (typeof pcm === "string") return bad(pcm);

  if (isTutorMock()) return json({ text: rawTextFixture }, SttBatchResponse);

  try {
    const text = await sttBatch(pcm); // verbatim: never trimmed or edited (non-negotiable 2)
    return json({ text }, SttBatchResponse);
  } catch (err) {
    console.error(`[stt-batch] ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "speech-to-text failed" }, ApiError, { status: 502 });
  }
}
