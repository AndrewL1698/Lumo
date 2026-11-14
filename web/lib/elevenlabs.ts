/** Server-only ElevenLabs wrapper (TTS + STT). Never import from client components. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ELEVENLABS } from "./config";

/** Read lazily so a missing key never breaks the build. */
export function getElevenLabsEnv() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  return { apiKey, voiceId };
}

/** Error for a non-2xx response: status + short body text. The key is never included. */
async function httpError(what: string, res: Response, apiKey: string): Promise<Error> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 200);
  } catch {
    // ignore: the status alone is enough
  }
  return new Error(`ElevenLabs ${what} failed: ${res.status} ${body.split(apiKey).join("***")}`.trim());
}

/** Single-use realtime STT token (15 min, consumed on first use). One per WebSocket connection. */
export async function mintSttToken(): Promise<string> {
  const { apiKey } = getElevenLabsEnv();
  const res = await fetch(`${ELEVENLABS.apiBase}/v1/single-use-token/realtime_scribe`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) throw await httpError("token", res, apiKey);
  const data = (await res.json()) as { token?: unknown };
  if (typeof data.token !== "string" || !data.token) throw new Error("ElevenLabs token failed: no token in response");
  return data.token;
}

type TtsOpts = { outputFormat?: string; voiceId?: string };

/** `web/.cache/tts`, whether the process runs from the repo root (tsx) or from `web/` (Next). */
function ttsCacheDir(): string {
  const cwd = process.cwd();
  const webDir = existsSync(path.join(cwd, "web", "package.json")) ? path.join(cwd, "web") : cwd;
  return path.join(webDir, ".cache", "tts");
}

/**
 * Beginner tutor replies mix English into Spanish (D-004), so sentences are left to Flash v2.5's
 * language detection, which also sounds more natural. Short texts (a hover-card word like "once"
 * or "pie") could be misdetected as English, so 3 words or fewer stay forced to Spanish.
 */
const forceSpanish = (text: string) => text.trim().split(/\s+/).length <= 3;

/** Disk-cache file for one (voice, model, format, text). Exported for the eval check. */
export function ttsCachePath(text: string, opts?: TtsOpts): string {
  const voiceId = opts?.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "";
  const format = opts?.outputFormat ?? ELEVENLABS.ttsOutputFormat;
  const key = createHash("sha256")
    // "auto" in the key so audio cached while everything was forced to Spanish isn't replayed.
    .update([voiceId, ELEVENLABS.ttsModel, format, ...(forceSpanish(text) ? [] : ["auto"]), text].join("\n"))
    .digest("hex");
  return path.join(ttsCacheDir(), `${key}.bin`);
}

/** Flash v2.5 TTS for one text chunk. Cached on disk: a repeated text makes no request. */
export async function ttsChunk(text: string, opts?: TtsOpts): Promise<ArrayBuffer> {
  const { apiKey, voiceId: envVoiceId } = getElevenLabsEnv();
  const voiceId = opts?.voiceId ?? envVoiceId;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set");
  const format = opts?.outputFormat ?? ELEVENLABS.ttsOutputFormat;
  const cacheFile = ttsCachePath(text, { voiceId, outputFormat: format });

  try {
    return new Uint8Array(await readFile(cacheFile)).buffer;
  } catch {
    // cache miss
  }

  const url = `${ELEVENLABS.apiBase}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS.ttsModel,
      ...(forceSpanish(text) ? { language_code: "es" } : {}),
    }),
  });
  if (!res.ok) throw await httpError("TTS", res, apiKey);
  const audio = await res.arrayBuffer();

  try {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, new Uint8Array(audio));
  } catch {
    // A read-only disk must not break playback.
  }
  return audio;
}

/** Batch STT fallback. `pcm` is raw 16 kHz mono s16le (no WAV header). Returns the transcript verbatim. */
export async function sttBatch(pcm: ArrayBuffer, opts?: { model?: string }): Promise<string> {
  const { apiKey } = getElevenLabsEnv();
  const form = new FormData();
  form.append("model_id", opts?.model ?? ELEVENLABS.sttBatchModel);
  form.append("language_code", "es");
  form.append("file_format", "pcm_s16le_16");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([pcm], { type: "application/octet-stream" }), "audio.pcm");
  const res = await fetch(`${ELEVENLABS.apiBase}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) throw await httpError("batch STT", res, apiKey);
  const data = (await res.json()) as { text?: unknown };
  if (typeof data.text !== "string") throw new Error("ElevenLabs batch STT failed: no text in response");
  return data.text;
}
