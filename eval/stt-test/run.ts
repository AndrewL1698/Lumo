/**
 * STT verbatim test runner (voice-plan §6). Every real run spends ElevenLabs credits: use --dry first.
 * Usage (repo root; keys via `node --env-file=web/.env.local --import tsx eval/stt-test/run.ts ...`):
 *   --sentences <path>   default eval/sentences.json
 *   --tts                generate Pass A WAVs into eval/stt-test/audio/A/<id>.wav (skips existing files).
 *                        Without --pass it only generates.
 *   --pass A|B           A = TTS audio; B = eval/stt-test/audio/B/<reader>/<id>.wav for every reader folder
 *   --configs a,b        from rt:scribe_v2_realtime, rt:scribe_v3_live, batch:scribe_v2, batch:scribe_v3
 *                        (default: every realtime candidate + batch scribe_v2)
 *   --limit N            first N sentences only
 *   --dry                print the plan (files x configs, audio seconds) and make no calls
 * Writes eval/stt-test/results/<pass>.json: [{pass, reader, id, config, transcript, ms, error?}].
 * Sequential, one call per (file, config), no retries.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ELEVENLABS } from "../../web/lib/config";
import { mintSttToken, sttBatch, ttsChunk } from "../../web/lib/elevenlabs";
import { createScribeClient } from "../../web/lib/tutor/client/scribeRealtime";
import type { ResultRow, Sentence } from "./score";

const HERE = import.meta.dirname;
const AUDIO_DIR = path.join(HERE, "audio");
const RESULTS_DIR = path.join(HERE, "results");
const SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = SAMPLE_RATE / 10; // 100 ms
/** Generous on purpose: the test measures commit latency, it must not cut slow answers off. */
const COMMIT_TIMEOUT_MS = 10_000;
/** Stop after this many failed calls in a row (bad key, no quota): no point burning the rest. */
const MAX_CONSECUTIVE_ERRORS = 3;

const ALL_CONFIGS = [
  ...ELEVENLABS.sttRealtimeCandidates.map((m) => `rt:${m}`),
  ...ELEVENLABS.sttBatchCandidates.map((m) => `batch:${m}`),
];
const DEFAULT_CONFIGS = [
  ...ELEVENLABS.sttRealtimeCandidates.map((m) => `rt:${m}`),
  `batch:${ELEVENLABS.sttBatchModel}`,
];

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(name);
function value(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`${name} needs a value`);
  return v;
}

/** Raw 16 kHz mono 16-bit samples from a WAV file. Throws on any other format. */
function readWavPcm(file: string): Int16Array {
  const buf = readFileSync(file);
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("latin1", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        rate: buf.readUInt32LE(start + 4),
        bits: buf.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      if (!fmt) throw new Error("data chunk before fmt chunk");
      // 1 = PCM, 0xfffe = extensible (accepted when the rest matches).
      if ((fmt.format !== 1 && fmt.format !== 0xfffe) || fmt.channels !== 1 || fmt.rate !== SAMPLE_RATE || fmt.bits !== 16) {
        throw new Error(
          `need 16 kHz mono 16-bit PCM, got format ${fmt.format}, ${fmt.channels} ch, ${fmt.rate} Hz, ${fmt.bits} bit`,
        );
      }
      // Streamed WAVs can carry a 0 or 0xffffffff size: take the rest of the file then.
      const end = size === 0 || start + size > buf.length ? buf.length : start + size;
      const bytes = new Uint8Array(buf.subarray(start, end - ((end - start) % 2))); // copy: aligned ArrayBuffer
      return new Int16Array(bytes.buffer);
    }
    off = start + size + (size % 2);
  }
  throw new Error("no data chunk");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runRealtime(model: string, pcm: Int16Array): Promise<{ transcript: string; ms: number }> {
  const token = await mintSttToken();
  const client = createScribeClient({ token, model, sampleRate: SAMPLE_RATE });
  try {
    const chunks: Int16Array[] = [];
    for (let i = 0; i < pcm.length; i += CHUNK_SAMPLES) chunks.push(pcm.subarray(i, i + CHUNK_SAMPLES));
    const last = chunks.pop() ?? new Int16Array(0);
    const t0 = performance.now();
    for (let i = 0; i < chunks.length; i++) {
      client.sendAudio(chunks[i]);
      // Real-time pace against the wall clock, so timer drift does not add up.
      await sleep(Math.max(0, t0 + (i + 1) * 100 - performance.now()));
    }
    const tCommit = performance.now();
    const transcript = await client.commit(last, COMMIT_TIMEOUT_MS);
    return { transcript, ms: Math.round(performance.now() - tCommit) };
  } finally {
    client.close();
  }
}

async function runBatch(model: string, pcm: Int16Array): Promise<{ transcript: string; ms: number }> {
  const body = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength).slice().buffer;
  const t0 = performance.now();
  const transcript = await sttBatch(body, { model });
  return { transcript, ms: Math.round(performance.now() - t0) };
}

async function main() {
  const dry = has("--dry");
  const tts = has("--tts");
  const passArg = value("--pass");
  if (passArg !== undefined && passArg !== "A" && passArg !== "B") die("--pass must be A or B");
  const pass = (passArg ?? (tts ? null : "A")) as "A" | "B" | null;
  const configs = (value("--configs")?.split(",") ?? DEFAULT_CONFIGS).map((c) => c.trim()).filter(Boolean);
  for (const c of configs) if (!ALL_CONFIGS.includes(c)) die(`unknown config "${c}". Choose from: ${ALL_CONFIGS.join(", ")}`);
  const limitArg = value("--limit");
  const limit = limitArg === undefined ? Infinity : Number(limitArg);
  if (!(limit > 0)) die("--limit must be a positive number");

  const sentencesPath = value("--sentences") ?? "eval/sentences.json";
  if (!existsSync(sentencesPath)) die(`sentences file not found: ${sentencesPath}`);
  const sentences = (JSON.parse(readFileSync(sentencesPath, "utf8")) as Sentence[]).slice(0, limit);

  // ---- Pass A audio (TTS) ----
  if (tts) {
    const dir = path.join(AUDIO_DIR, "A");
    const todo = sentences.filter((s) => !existsSync(path.join(dir, `${s.id}.wav`)));
    const chars = todo.reduce((n, s) => n + s.text.length, 0);
    console.log(`TTS: ${todo.length} of ${sentences.length} WAVs to generate (${chars} characters) into ${dir}`);
    if (!dry) {
      mkdirSync(dir, { recursive: true });
      for (const s of todo) {
        const audio = await ttsChunk(s.text, { outputFormat: ELEVENLABS.ttsWavFormat });
        writeFileSync(path.join(dir, `${s.id}.wav`), new Uint8Array(audio));
        console.log(`tts ${s.id}: ${audio.byteLength} bytes`);
      }
    }
  }
  if (!pass) return;

  // ---- plan ----
  const readers: { reader: string; dir: string }[] = [];
  if (pass === "A") {
    readers.push({ reader: "tts", dir: path.join(AUDIO_DIR, "A") });
  } else {
    const root = path.join(AUDIO_DIR, "B");
    const names = existsSync(root) ? readdirSync(root).filter((n) => statSync(path.join(root, n)).isDirectory()) : [];
    if (names.length === 0) console.log(`missing: no reader folders in ${root} (expected ${root}/<reader>/<id>.wav)`);
    for (const reader of names.sort()) readers.push({ reader, dir: path.join(root, reader) });
  }

  const files: { reader: string; id: string; pcm: Int16Array; seconds: number }[] = [];
  let missing = 0;
  for (const { reader, dir } of readers) {
    for (const s of sentences) {
      const file = path.join(dir, `${s.id}.wav`);
      if (!existsSync(file)) {
        missing++;
        console.log(`missing: ${file}`);
        continue;
      }
      try {
        const pcm = readWavPcm(file);
        files.push({ reader, id: s.id, pcm, seconds: pcm.length / SAMPLE_RATE });
      } catch (err) {
        missing++;
        console.log(`unusable: ${file} (${(err as Error).message})`);
      }
    }
  }

  const fileSeconds = files.reduce((n, f) => n + f.seconds, 0);
  const billedSeconds = fileSeconds * configs.length;
  console.log(
    `Pass ${pass}: ${files.length} files (${missing} missing) x ${configs.length} configs [${configs.join(", ")}] = ` +
      `${files.length * configs.length} calls; ${fileSeconds.toFixed(1)} s of audio per config, ` +
      `${billedSeconds.toFixed(1)} s sent in total`,
  );
  if (dry) {
    console.log("dry run: no calls made");
    return;
  }
  if (files.length === 0) die("nothing to run");

  // ---- run ----
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, `${pass}.json`);
  // Keep rows from earlier runs (e.g. another config); this run replaces rows with the same key.
  const keyOf = (r: ResultRow) => `${r.reader}|${r.id}|${r.config}`;
  const rows = new Map<string, ResultRow>();
  if (existsSync(outFile)) for (const r of JSON.parse(readFileSync(outFile, "utf8")) as ResultRow[]) rows.set(keyOf(r), r);

  let sentSeconds = 0;
  let consecutiveErrors = 0;
  let n = 0;
  const total = files.length * configs.length;
  outer: for (const f of files) {
    for (const config of configs) {
      n++;
      const [kind, model] = config.split(":");
      const row: ResultRow = { pass, reader: f.reader, id: f.id, config, transcript: "", ms: 0 };
      const t0 = performance.now();
      try {
        const r = kind === "rt" ? await runRealtime(model, f.pcm) : await runBatch(model, f.pcm);
        row.transcript = r.transcript; // verbatim: never trimmed or edited
        row.ms = r.ms;
        consecutiveErrors = 0;
      } catch (err) {
        row.error = (err as Error).message;
        row.ms = Math.round(performance.now() - t0);
        consecutiveErrors++;
      }
      sentSeconds += f.seconds;
      rows.set(keyOf(row), row);
      writeFileSync(outFile, JSON.stringify([...rows.values()], null, 2) + "\n"); // after every call: a crash loses nothing
      console.log(
        `[${n}/${total}] ${pass} ${f.reader} ${f.id} ${config} ${row.ms} ms: ` +
          (row.error ? `ERROR ${row.error}` : JSON.stringify(row.transcript)),
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`${MAX_CONSECUTIVE_ERRORS} calls failed in a row: stopping.`);
        break outer;
      }
    }
  }
  console.log(`wrote ${outFile}; total audio sent: ${sentSeconds.toFixed(1)} s`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
