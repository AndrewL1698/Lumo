/** Single demo user this weekend (no auth). */
export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001";

/** Claude models (architecture §10). Change here only. */
export const MODELS = {
  correction: "claude-haiku-5-5",
  conversation: "claude-sonnet-5-5",
} as const;

/** ElevenLabs models (voice-plan). */
export const ELEVENLABS = {
  ttsModel: "eleven_flash_v2_5",
  sttRealtimeModel: "scribe_v2_realtime",
  sttBatchModel: "scribe_v2",
} as const;
