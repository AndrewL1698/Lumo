/** Server-only ElevenLabs wrapper (TTS + STT). Never import from client components. */
// TODO(andrew): add `import "server-only"` once the package is installed.

/** Read lazily so a missing key never breaks the build. */
export function getElevenLabsEnv() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  return { apiKey, voiceId };
}

// TODO(andrew): single-use realtime STT token (ELEVENLABS.sttRealtimeModel).
export async function mintSttToken(): Promise<string> {
  throw new Error("not implemented");
}

// TODO(andrew): Flash v2.5 TTS for one text chunk (ELEVENLABS.ttsModel, voiceId).
export async function ttsChunk(_text: string): Promise<ArrayBuffer> {
  throw new Error("not implemented");
}

// TODO(andrew): batch STT fallback (ELEVENLABS.sttBatchModel).
export async function sttBatch(_wav: ArrayBuffer): Promise<string> {
  throw new Error("not implemented");
}
