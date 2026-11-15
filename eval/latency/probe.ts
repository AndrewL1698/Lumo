/**
 * Mic-free latency probe: replays one tutor turn per sentence the way the browser does
 * (web/lib/tutor/client/useTutorSession.ts runTurn/replyLane), so server-side tuning can be A/B tested.
 *
 *   npm run dev:web    (in another terminal)
 *   npx tsx eval/latency/probe.ts [--n 10] [--url http://localhost:3000] [--file eval/sentences.json] [--no-tts]
 *
 * Per turn: POST /api/tutor/correct and /api/tutor/reply in parallel at t0, feed the reply stream into
 * createChunker(), POST /api/tts for the first chunk and read the whole MP3 (the client buffers it).
 * Never calls /api/tutor/context, so these sessions never write the demo user's learner events.
 * Writes eval/latency/probe-results/<ISO timestamp>.json (timings only, no audio).
 *
 * Reads a little optimistic against the real page: every turn is a fresh session (no history, no
 * tutorPrevious, fixture context), TTS gets no level (normal speed), later chunks and decodeAudioData are
 * not timed, and failed corrections still count. Use it to compare server changes, and the browser's
 * eval/latency/turns.jsonl (summarize.ts) for the pitch numbers.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CorrectRequest, CorrectResponse, ReplyRequest, TtsRequest } from "@parrot/shared";
import { createChunker } from "../../web/lib/tutor/chunker";
import { stat, TARGETS, type Stat } from "./summarize";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const N = Math.max(1, Number.parseInt(arg("--n", "10"), 10) || 10);
const URL = arg("--url", "http://localhost:3000");
const FILE = arg("--file", join(HERE, "..", "sentences.json"));
const NO_TTS = process.argv.includes("--no-tts");
const CACHED_MS = 40; // a disk-cache hit in web/lib/elevenlabs.ts returns in a few ms

type Turn = {
  index: number;
  text: string;
  correction: number | null;
  serverMs: number | null;
  replyFirstByte: number | null;
  firstChunk: number | null;
  firstChunkText: string | null;
  ttsMs: number | null;
  ttsCached: boolean;
  audioReady: number | null;
  flags: string[];
  errors: string[];
};

const post = (path: string, body: unknown) =>
  fetch(`${URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const errMsg = (e: unknown) => {
  const err = e as Error & { cause?: { code?: string } };
  return err?.cause?.code ?? err?.message ?? String(e);
};

async function correctLane(t0: number, body: CorrectRequest, turn: Turn) {
  try {
    const res = await post("/api/tutor/correct", body);
    if (res.headers.get("X-Correction-Failed")) turn.flags.push("correction-failed");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = CorrectResponse.parse(await res.json());
    turn.correction = performance.now() - t0;
    turn.serverMs = out.serverMs;
  } catch (e) {
    turn.errors.push(`correct: ${errMsg(e)}`);
  }
}

/** Streams the reply; fires TTS for the first chunk the moment it is complete, as the browser does. */
async function replyLane(t0: number, body: ReplyRequest, turn: Turn) {
  let first: string | null = null;
  let ttsDone: Promise<void> = Promise.resolve();
  const onFirst = (chunk: string) => {
    first = chunk;
    turn.firstChunk = performance.now() - t0;
    turn.firstChunkText = chunk;
    if (!NO_TTS)
      ttsDone = tts(chunk, turn).then(() => {
        if (turn.ttsMs !== null && turn.firstChunk !== null) turn.audioReady = turn.firstChunk + turn.ttsMs;
      });
  };
  try {
    const res = await post("/api/tutor/reply", body);
    if (res.headers.get("X-Reply-Fallback")) turn.flags.push("reply-fallback");
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const chunker = createChunker();
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    for (;;) {
      const { done, value } = await reader.read();
      const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (text) {
        turn.replyFirstByte ??= performance.now() - t0;
        if (first === null) {
          const chunks = chunker.push(text);
          if (chunks.length) onFirst(chunks[0]);
        }
      }
      if (done) break;
    }
    if (first === null) {
      const rest = chunker.flush()[0];
      if (rest) onFirst(rest);
    }
  } catch (e) {
    turn.errors.push(`reply: ${errMsg(e)}`);
  }
  await ttsDone;
}

async function tts(text: string, turn: Turn) {
  const t = performance.now();
  try {
    const res = await post("/api/tts", TtsRequest.parse({ text }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.arrayBuffer();
    turn.ttsMs = performance.now() - t;
    turn.ttsCached = turn.ttsMs < CACHED_MS;
  } catch (e) {
    turn.errors.push(`tts: ${errMsg(e)}`);
  }
}

async function runTurn(index: number, text: string): Promise<Turn> {
  const turn: Turn = {
    index, text, correction: null, serverMs: null, replyFirstByte: null, firstChunk: null,
    firstChunkText: null, ttsMs: null, ttsCached: false, audioReady: null, flags: [], errors: [],
  };
  const sessionId = randomUUID();
  const utteranceId = randomUUID();
  const correctBody = CorrectRequest.parse({ sessionId, utteranceId, rawText: text, sttPath: "typed" });
  const replyBody = ReplyRequest.parse({ sessionId, utteranceId, rawText: text, history: [] });
  const t0 = performance.now();
  await Promise.all([correctLane(t0, correctBody, turn), replyLane(t0, replyBody, turn)]);
  return turn;
}

// ---- main ----
let sentences: string[];
try {
  sentences = (JSON.parse(readFileSync(FILE, "utf8")) as { text: string }[]).map((s) => s.text).filter(Boolean);
  if (!sentences.length) throw new Error("no sentences with a text field");
} catch (e) {
  console.error(`Can't read sentences from ${FILE}: ${errMsg(e)}`);
  process.exit(1);
}
const picked = Array.from({ length: N }, (_, i) => sentences[i % sentences.length]);

const ms = (v: number | null) => (v === null ? "-" : `${Math.round(v)}`);
console.log(`Latency probe: ${N} turns against ${URL}${NO_TTS ? " (no TTS)" : ""}, sentences from ${FILE}`);
console.log("Times are ms from STT final (both requests sent), not from button release:");
console.log("add ~190 ms of STT to compare with eval/latency/summarize.ts.");

process.stdout.write("Warm-up turn (not measured)... ");
const warm = await runTurn(0, picked[0]);
console.log(warm.errors.length ? `errors: ${warm.errors.join("; ")}` : "ok");

const turns: Turn[] = [];
for (let i = 0; i < N; i++) {
  const t = await runTurn(i + 1, picked[i]);
  turns.push(t);
  const chunk = t.firstChunkText === null ? "-" : t.firstChunkText.length > 60 ? `${t.firstChunkText.slice(0, 57)}...` : t.firstChunkText;
  const flags = [...t.flags, ...(t.ttsCached ? ["tts-cached"] : []), ...t.errors];
  console.log(
    `#${String(t.index).padStart(2)}  corr ${ms(t.correction).padStart(5)} (srv ${ms(t.serverMs).padStart(5)})` +
      `  reply1st ${ms(t.replyFirstByte).padStart(5)}  chunk ${ms(t.firstChunk).padStart(5)}` +
      `  tts ${ms(t.ttsMs).padStart(5)}  audio ${ms(t.audioReady).padStart(5)}  "${chunk}"` +
      (flags.length ? `  [${flags.join(", ")}]` : ""),
  );
}

const vals = (f: (t: Turn) => number | null) => turns.map(f).filter((v): v is number => v !== null);
const uncachedTts = turns.filter((t) => !t.ttsCached);
const stats: Record<string, Stat> = {
  correction: stat(vals((t) => t.correction)),
  serverMs: stat(vals((t) => t.serverMs)),
  replyFirstByte: stat(vals((t) => t.replyFirstByte)),
  firstChunk: stat(vals((t) => t.firstChunk)),
  ttsMs: stat(uncachedTts.map((t) => t.ttsMs).filter((v): v is number => v !== null)),
  audioReady: stat(uncachedTts.map((t) => t.audioReady).filter((v): v is number => v !== null)),
};
const cachedCount = turns.filter((t) => t.ttsCached).length;

const fmt = (v: number | null) => (v === null ? "-" : `${Math.round(v)} ms`);
console.log(`\n  ${"metric".padEnd(16)}${"n".padStart(4)}${"median".padStart(11)}${"p90".padStart(11)}`);
for (const [k, s] of Object.entries(stats))
  console.log(`  ${k.padEnd(16)}${String(s.n).padStart(4)}${fmt(s.median).padStart(11)}${fmt(s.p90).padStart(11)}`);
if (cachedCount) console.log(`  (${cachedCount} cached TTS turn(s) excluded from ttsMs and audioReady)`);

const verdict = (label: string, median: number | null, target: number) =>
  console.log(`${median === null ? "NO DATA" : median <= target ? "PASS" : "FAIL"}  median ${label} ${fmt(median)} (target <= ${target} ms, from STT final)`);
console.log("");
verdict("correction", stats.correction.median, TARGETS.correctionMs);
if (!NO_TTS) verdict("audioReady", stats.audioReady.median, TARGETS.audioMs);
const failed = turns.filter((t) => t.errors.length).length;
if (failed) console.log(`!! ${failed} turn(s) had errors (see the per-turn lines)`);

const ranAt = new Date().toISOString();
const outDir = join(HERE, "probe-results");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${ranAt.replace(/:/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ ranAt, url: URL, file: relative(process.cwd(), FILE), n: N, noTts: NO_TTS, cachedTtsExcluded: cachedCount, stats, turns }, null, 2) + "\n");
console.log(`\nWrote ${out}`);
