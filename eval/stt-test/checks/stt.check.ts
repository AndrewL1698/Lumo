/**
 * Offline check for elevenlabs.ts, scribeRealtime.ts and score.ts. No network: fetch and WebSocket are fakes.
 * Run from the repo root: npx tsx eval/stt-test/checks/stt.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ELEVENLABS } from "../../../web/lib/config";
import { mintSttToken, sttBatch, ttsCachePath, ttsChunk } from "../../../web/lib/elevenlabs";
import { createScribeClient } from "../../../web/lib/tutor/client/scribeRealtime";
import type { WebSocketLike } from "../../../web/lib/tutor/types";
import { normalise, score } from "../score";

process.env.ELEVENLABS_API_KEY = "test-key";
process.env.ELEVENLABS_VOICE_ID = "voice_test";

// ---------- fake fetch ----------
type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
let nextResponse: () => Response = () => new Response("{}");
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), init: init ?? {} });
  return nextResponse();
}) as typeof fetch;
const headersOf = (c: Call) => new Headers(c.init.headers);

async function checkHttp() {
  // token
  nextResponse = () => Response.json({ token: "tok_123" });
  assert.equal(await mintSttToken(), "tok_123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(headersOf(calls[0]).get("xi-api-key"), "test-key");

  // TTS + disk cache
  const text = `prueba de caché ${Date.now()}-${Math.random()}`;
  const cacheFile = ttsCachePath(text);
  assert.ok(cacheFile.includes(path.join("web", ".cache", "tts")), cacheFile);
  try {
    nextResponse = () => new Response(new Uint8Array([1, 2, 3, 4]));
    const first = await ttsChunk(text);
    assert.deepEqual([...new Uint8Array(first)], [1, 2, 3, 4]);
    assert.equal(calls.length, 2);
    const tts = calls[1];
    assert.equal(
      tts.url,
      `https://api.elevenlabs.io/v1/text-to-speech/voice_test?output_format=${ELEVENLABS.ttsOutputFormat}`,
    );
    assert.equal(tts.init.method, "POST");
    assert.equal(headersOf(tts).get("xi-api-key"), "test-key");
    assert.equal(headersOf(tts).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(tts.init.body as string), {
      text,
      model_id: ELEVENLABS.ttsModel,
      language_code: "es",
    });
    assert.ok(existsSync(cacheFile));

    const second = await ttsChunk(text);
    assert.equal(calls.length, 2, "cache hit must not fetch");
    assert.deepEqual([...new Uint8Array(second)], [1, 2, 3, 4]);

    // another format is another cache entry and another URL
    const wavFile = ttsCachePath(text, { outputFormat: ELEVENLABS.ttsWavFormat });
    try {
      await ttsChunk(text, { outputFormat: ELEVENLABS.ttsWavFormat });
      assert.equal(calls.length, 3);
      assert.ok(calls[2].url.endsWith(`?output_format=${ELEVENLABS.ttsWavFormat}`));
    } finally {
      rmSync(wavFile, { force: true });
    }
  } finally {
    rmSync(cacheFile, { force: true });
  }

  // no voice id
  delete process.env.ELEVENLABS_VOICE_ID;
  await assert.rejects(ttsChunk("hola"), /ELEVENLABS_VOICE_ID/);
  process.env.ELEVENLABS_VOICE_ID = "voice_test";
  assert.equal(calls.length, 3);

  // batch STT
  nextResponse = () => Response.json({ text: " Yo tiene la problema." });
  const pcm = new Int16Array([1, -2, 300, -400]);
  assert.equal(await sttBatch(pcm.buffer), " Yo tiene la problema.", "batch transcript is verbatim");
  const batch = calls[3];
  assert.equal(batch.url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(batch.init.method, "POST");
  assert.equal(headersOf(batch).get("xi-api-key"), "test-key");
  const form = batch.init.body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("model_id"), ELEVENLABS.sttBatchModel);
  assert.equal(form.get("language_code"), "es");
  assert.equal(form.get("file_format"), "pcm_s16le_16");
  assert.equal(form.get("tag_audio_events"), "false");
  assert.equal(form.has("no_verbatim"), false);
  const file = form.get("file") as Blob;
  assert.deepEqual([...new Int16Array(await file.arrayBuffer())], [1, -2, 300, -400]);

  await sttBatch(pcm.buffer, { model: "scribe_v3" });
  assert.equal((calls[4].init.body as FormData).get("model_id"), "scribe_v3");

  // errors: status + body, never the key
  nextResponse = () => new Response("bad key test-key", { status: 401 });
  await assert.rejects(mintSttToken(), (err: Error) => {
    assert.match(err.message, /401/);
    assert.match(err.message, /bad key/);
    assert.ok(!err.message.includes("test-key"));
    return true;
  });
}

// ---------- fake WebSocket ----------
class FakeSocket implements WebSocketLike {
  static last: FakeSocket;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    assert.equal(this.readyState, 1, "send before open");
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const b64 = (pcm: Int16Array) => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString("base64");

async function checkScribe() {
  const partials: string[] = [];
  const make = () =>
    createScribeClient({
      token: "tok 1",
      model: "scribe_v2_realtime",
      onPartial: (t) => partials.push(t),
      WebSocketImpl: FakeSocket,
    });

  // URL, buffering, message shape, partials, verbatim commit
  let client = make();
  let ws = FakeSocket.last;
  const url = new URL(ws.url);
  assert.equal(url.origin + url.pathname, "wss://api.elevenlabs.io/v1/speech-to-text/realtime");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    model_id: "scribe_v2_realtime",
    token: "tok 1",
    language_code: "es",
    audio_format: "pcm_16000",
    commit_strategy: "manual",
  });

  const a = new Int16Array([1, 2, -3]);
  const b = new Int16Array([1000, -1000]);
  const c = new Int16Array([7]);
  client.sendAudio(a);
  client.sendAudio(b);
  assert.equal(ws.sent.length, 0, "buffered until open");
  ws.open();
  assert.equal(ws.sent.length, 2, "flushed on open");
  assert.equal(
    ws.sent[0],
    JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64(a), commit: false, sample_rate: 16000 }),
  );
  assert.deepEqual(JSON.parse(ws.sent[1]), {
    message_type: "input_audio_chunk",
    audio_base_64: b64(b),
    commit: false,
    sample_rate: 16000,
  });

  ws.receive({ message_type: "session_started", session_id: "s1" });
  ws.receive({ message_type: "partial_transcript", text: "Yo tiene" });
  assert.deepEqual(partials, ["Yo tiene"]);

  const committed = client.commit(c, 1000);
  assert.deepEqual(JSON.parse(ws.sent[2]), {
    message_type: "input_audio_chunk",
    audio_base_64: b64(c),
    commit: true,
    sample_rate: 16000,
  });
  const verbatim = " Yo tiene la problema, ¿verdad? ";
  ws.receive({ message_type: "committed_transcript", text: verbatim });
  assert.equal(await committed, verbatim, "committed text is returned unmodified");
  assert.ok(ws.closed, "socket closed after resolving");

  // commit before open: the commit chunk is queued behind the audio
  client = make();
  ws = FakeSocket.last;
  client.sendAudio(a);
  const early = client.commit(b, 1000);
  ws.open();
  assert.deepEqual(
    ws.sent.map((m) => JSON.parse(m).commit),
    [false, true],
  );
  ws.receive({ message_type: "committed_transcript", text: "hola" });
  assert.equal(await early, "hola");

  // insufficient_audio_activity → ""
  client = make();
  ws = FakeSocket.last;
  ws.open();
  const quiet = client.commit(c, 1000);
  ws.receive({ message_type: "insufficient_audio_activity", error: "no speech" });
  assert.equal(await quiet, "");
  assert.ok(ws.closed);

  // auth_error → rejects
  client = make();
  ws = FakeSocket.last;
  ws.open();
  const denied = client.commit(c, 1000);
  ws.receive({ message_type: "auth_error", error: "bad token" });
  await assert.rejects(denied, /auth_error: bad token/);
  assert.ok(ws.closed);

  // error before commit → commit rejects at once
  client = make();
  ws = FakeSocket.last;
  ws.open();
  ws.receive({ message_type: "quota_exceeded", error: "out of credits" });
  await assert.rejects(client.commit(c, 1000), /quota_exceeded/);

  // server close while waiting → rejects
  client = make();
  ws = FakeSocket.last;
  ws.open();
  const dropped = client.commit(c, 1000);
  ws.close();
  await assert.rejects(dropped, /closed/);

  // timeout → rejects and closes
  client = make();
  ws = FakeSocket.last;
  ws.open();
  await assert.rejects(client.commit(c, 20), /timed out/);
  assert.ok(ws.closed);
}

// ---------- score.ts ----------
function checkScore() {
  assert.equal(normalise("  ¿Yo tiene LA problema, verdad?  Sí. "), "yo tiene la problema verdad si");

  const dir = mkdtempSync(path.join(os.tmpdir(), "stt-check-"));
  try {
    const out = path.join(dir, "results.md");
    const row = (pass: string, reader: string, id: string, config: string, transcript: string, ms: number, error?: string) => ({
      pass,
      reader,
      id,
      config,
      transcript,
      ms,
      ...(error ? { error } : {}),
    });
    const rt = "rt:scribe_v2_realtime";
    const batch = "batch:scribe_v2";
    writeFileSync(
      path.join(dir, "A.json"),
      JSON.stringify([
        row("A", "tts", "dev1", rt, "Yo tiene la problema porque la huelga no termina.", 200), // survived
        row("A", "tts", "dev2", rt, "Ayer nosotros comimos arroz con pollo en la casa de mi abuela.", 400), // fixed
        row("A", "tts", "dev3", rt, "Mañana voy a visitar a mis primos en la ciudad.", 300), // clean kept
        row("A", "tts", "dev1", batch, "Yo tiene el problema porque la huelga no termina.", 900), // fixed
        row("A", "tts", "dev2", batch, "Ayer comieron arroz.", 1100), // garbled
        row("A", "tts", "dev3", batch, "Mañana voy a visitar a mi primo en la ciudad.", 1000), // clean changed
      ]),
    );
    writeFileSync(
      path.join(dir, "B.json"),
      JSON.stringify([
        row("B", "karthik", "dev1", rt, "yo tiene la problema", 250), // survived
        row("B", "karthik", "dev2", rt, "Ayer nosotros come arroz con pollo", 350), // survived
        row("B", "andrew", "dev1", rt, "", 9000, "Scribe commit timed out"), // call error
        row("B", "andrew", "dev2", rt, "", 150), // garbled (empty)
        row("B", "andrew", "nope", rt, "x", 1), // unknown id
      ]),
    );

    const s = score({ sentences: "eval/stt-test/dev-sentences.json", resultsDir: dir, out });
    const pick = (key: string) => {
      const c = s.byPassConfig[key];
      return [c.survived, c.fixed, c.garbled, c.clean_kept, c.clean_changed, c.call_error];
    };
    assert.deepEqual(pick(`A|${rt}`), [1, 1, 0, 1, 0, 0]);
    assert.deepEqual(pick(`A|${batch}`), [0, 1, 1, 0, 1, 0]);
    assert.deepEqual(pick(`B|${rt}`), [2, 0, 1, 0, 0, 1]);
    assert.equal(s.byReader[`B|karthik|${rt}`].survived, 2);
    assert.equal(s.byReader[`B|andrew|${rt}`].garbled, 1);
    assert.equal(s.byReader[`B|andrew|${rt}`].call_error, 1);
    assert.equal(s.byType[`A|${rt}|agreement`].survived, 1);
    assert.equal(s.byType[`A|${rt}|conjugation`].fixed, 1);
    assert.equal(s.medianMs[`A|${rt}`], 300);
    assert.equal(s.medianMs[`B|${rt}`], 250, "call errors are left out of the median");
    assert.deepEqual(s.unknownIds, ["nope"]);

    const md = readFileSync(out, "utf8");
    assert.ok(md.includes("Yo tiene la problema porque la huelga no termina."), "raw transcript in the table");
    assert.ok(md.includes(`| A | ${rt} | 50% (1/2) |`));
    assert.ok(md.includes(`| karthik | ${rt} | 100% (2/2) |`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await checkHttp();
await checkScribe();
checkScore();
assert.equal(
  calls.filter((c) => !c.url.startsWith(ELEVENLABS.apiBase)).length,
  0,
  "every request goes to the ElevenLabs base URL",
);
console.log("ok");
