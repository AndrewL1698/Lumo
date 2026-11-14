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
  /** Browser playback format, and the 16 kHz WAV the STT test reads (Pass A). */
  ttsOutputFormat: "mp3_44100_128",
  ttsWavFormat: "wav_16000",
  /** Chosen realtime model; updated after the STT test (voice-plan §6). */
  sttRealtimeModel: "scribe_v2_realtime",
  sttBatchModel: "scribe_v2",
  /** STT test candidates (eval/stt-test). */
  sttRealtimeCandidates: ["scribe_v2_realtime", "scribe_v3_live"],
  sttBatchCandidates: ["scribe_v2", "scribe_v3"],
  apiBase: "https://api.elevenlabs.io",
  realtimeUrl: "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
} as const;

/** Send server-side refusal fallbacks on the Sonnet call. Flip to false if the API rejects it (voice-plan §5b). */
export const CLAUDE_FALLBACKS = true;

/** `TUTOR_MOCK=1` makes the tutor routes return /shared fixtures (no Claude or ElevenLabs calls). */
export const isTutorMock = () => process.env.TUTOR_MOCK === "1";

/** Voice tutor thresholds (voice-plan §1, §2). Safe to import from client code: no secrets here. */
export const TUTOR = {
  showConfidence: 0.7,
  keepConfidence: 0.5,
  minHoldMs: 300,
  maxHoldMs: 30_000,
  tailMs: 120,
  sttCommitTimeoutMs: 1500,
  correctTimeoutMs: 4000,
  replyFirstTokenTimeoutMs: 4000,
  firstChunkCommaMinChars: 25,
  sampleRate: 16_000,
  cannedRepeat: "Perdón, ¿puedes repetirlo?",
} as const;
