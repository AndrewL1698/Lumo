/** Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/audio.check.ts (no network, no env file) */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { POST, OPTIONS } from "../../../app/api/tts/route";
import { ttsCachePath } from "../../elevenlabs";
import { createAudioQueue, type Playable } from "../client/audioQueue";

const tick = () => new Promise<void>((r) => setImmediate(r));
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const dec = (b: ArrayBuffer) => new TextDecoder().decode(b);

/** Fakes: fetches resolve when the test says so; "audio" ends when the test says so. */
function harness() {
  const fetches = new Map<
    string,
    { resolve: () => void; reject: () => void; signal: AbortSignal }
  >();
  const events: string[] = [];
  const failed: string[] = [];
  const playing = new Map<string, () => void>(); // text → end()
  const queue = createAudioQueue({
    mode: "elevenlabs",
    fetchAudio: (text, signal) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        fetches.set(text, {
          resolve: () => resolve(enc(text)),
          reject: () => reject(new Error("boom")),
          signal,
        });
      }),
    decode: async (buf): Promise<Playable> => {
      const text = dec(buf);
      return {
        duration: 1,
        play(at, onStart, onEnd) {
          assert.equal(at, 0);
          events.push(`play:${text}`);
          playing.set(text, () => {
            playing.delete(text);
            events.push(`end:${text}`);
            onEnd();
          });
          onStart();
          return {
            stop() {
              playing.delete(text);
              events.push(`stop:${text}`);
            },
          };
        },
      };
    },
    onChunkFailed: (turn, index) => failed.push(`${turn}.${index}`),
  });
  const enqueue = (turn: number, index: number, text: string) =>
    queue.enqueue(turn, index, text, () => events.push(`start:${text}`));
  return { queue, fetches, events, failed, playing, enqueue };
}

async function queueChecks() {
  // --- out-of-order fetches still play 0,1,2; onStart once per chunk, in order ---
  {
    const h = harness();
    h.enqueue(1, 0, "a");
    h.enqueue(1, 1, "b");
    h.enqueue(1, 2, "c");
    await tick();
    assert.deepEqual(
      [...h.fetches.keys()],
      ["a", "b", "c"],
      "all fetches start at enqueue (parallel)",
    );
    let idle = false;
    void h.queue.idle(1).then(() => (idle = true));

    h.fetches.get("b")!.resolve(); // index 1 first
    h.fetches.get("c")!.resolve();
    await tick();
    assert.deepEqual(h.events, [], "nothing plays before index 0 is ready");
    h.fetches.get("a")!.resolve();
    await tick();
    assert.deepEqual(h.events, ["play:a", "start:a"]);
    assert.equal(h.playing.size, 1, "one source at a time");
    h.playing.get("a")!();
    await tick();
    h.playing.get("b")!();
    await tick();
    assert.equal(idle, false, "not idle while the last chunk plays");
    h.playing.get("c")!();
    await tick();
    assert.deepEqual(h.events, [
      "play:a",
      "start:a",
      "end:a",
      "play:b",
      "start:b",
      "end:b",
      "play:c",
      "start:c",
      "end:c",
    ]);
    assert.equal(idle, true, "idle resolves after the last chunk ends");
    assert.deepEqual(h.failed, []);
    await h.queue.idle(1); // already finished
    await h.queue.idle(99); // never enqueued
  }

  // --- a failing chunk is skipped; later chunks still play ---
  {
    const h = harness();
    h.enqueue(1, 0, "a");
    h.enqueue(1, 1, "b");
    h.enqueue(1, 2, "c");
    await tick();
    h.fetches.get("c")!.resolve();
    h.fetches.get("b")!.reject();
    await tick();
    assert.deepEqual(h.failed, ["1.1"]);
    assert.deepEqual(h.events, [], "a failed later chunk does not jump the queue");
    h.fetches.get("a")!.resolve();
    await tick();
    h.playing.get("a")!();
    await tick();
    h.playing.get("c")!();
    await tick();
    assert.deepEqual(
      (h.events as string[]).filter((e) => e.startsWith("start:")),
      ["start:a", "start:c"],
    );
    await h.queue.idle(1);

    // failing head does not block; a turn where everything fails still goes idle
    h.enqueue(2, 0, "x");
    h.enqueue(2, 1, "y");
    await tick();
    h.fetches.get("y")!.resolve();
    h.fetches.get("x")!.reject();
    await tick();
    assert.ok(h.playing.has("y"), "chunk after a failed head plays");
    h.playing.get("y")!();
    h.enqueue(3, 0, "z");
    await tick();
    h.fetches.get("z")!.reject();
    await h.queue.idle(3);
    assert.deepEqual(h.failed, ["1.1", "2.0", "3.0"]);
  }

  // --- stopAll mid-playback ---
  {
    const h = harness();
    h.enqueue(1, 0, "a");
    h.enqueue(1, 1, "b");
    h.enqueue(1, 2, "c");
    await tick();
    h.fetches.get("a")!.resolve();
    h.fetches.get("b")!.resolve(); // decoded and waiting behind a
    await tick();
    assert.ok(h.playing.has("a"));
    let idle = false;
    void h.queue.idle(1).then(() => (idle = true));
    const signals = ["a", "b", "c"].map((t) => h.fetches.get(t)!.signal);
    assert.ok(signals.every((s) => !s.aborted));

    h.queue.stopAll();
    assert.ok(
      signals.every((s) => s.aborted),
      "pending fetches see an aborted signal",
    );
    assert.equal(h.events.at(-1), "stop:a", "current source stopped");
    await tick();
    assert.equal(idle, true, "idle() of a stopped turn resolves");

    h.fetches.get("c")!.resolve(); // late result from the stopped turn
    await tick();
    assert.deepEqual(h.events, ["play:a", "start:a", "stop:a"], "nothing starts after stopAll");
    assert.deepEqual(h.failed, [], "aborted chunks are not reported as failures");
    h.queue.stopAll(); // idempotent

    // a new turn plays normally
    h.enqueue(2, 0, "d");
    h.enqueue(2, 1, "e");
    await tick();
    assert.equal(h.fetches.get("d")!.signal.aborted, false, "new turn gets a fresh signal");
    h.fetches.get("e")!.resolve();
    h.fetches.get("d")!.resolve();
    await tick();
    h.playing.get("d")!();
    await tick();
    h.playing.get("e")!();
    await h.queue.idle(2);
    assert.deepEqual(h.events.slice(3), [
      "play:d",
      "start:d",
      "end:d",
      "play:e",
      "start:e",
      "end:e",
    ]);
  }

  // --- stopAll while everything is still loading; a late REJECT is ignored too ---
  {
    const h = harness();
    h.enqueue(1, 0, "a");
    await tick();
    const p = h.queue.idle(1);
    h.queue.stopAll();
    await p;
    h.fetches.get("a")!.reject();
    await tick();
    assert.deepEqual(h.events, []);
    assert.deepEqual(h.failed, []);
  }

  // --- turns never overlap: a later turn waits for the earlier one ---
  {
    const h = harness();
    h.enqueue(1, 0, "a");
    h.enqueue(2, 0, "b");
    await tick();
    h.fetches.get("b")!.resolve();
    await tick();
    assert.deepEqual(h.events, []);
    h.fetches.get("a")!.resolve();
    await tick();
    h.playing.get("a")!();
    await h.queue.idle(1);
    assert.ok(h.playing.has("b"));
    h.queue.stopAll();
  }
}

async function routeChecks() {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const saved = {
    mock: process.env.TUTOR_MOCK,
    key: process.env.ELEVENLABS_API_KEY,
    voice: process.env.ELEVENLABS_VOICE_ID,
  };
  const text = `audio check ${process.pid} ${Date.now()}`;
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  const logs: string[] = [];
  let calls = 0;
  let upstreamStatus = 200;
  try {
    delete process.env.TUTOR_MOCK;
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "voice_test";
    console.error = (...a: unknown[]) => void logs.push(a.join(" "));
    globalThis.fetch = (async (url: unknown) => {
      calls++;
      assert.match(String(url), /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice_test\?/);
      return upstreamStatus === 200
        ? new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
        : new Response("upstream exploded test-key", { status: upstreamStatus });
    }) as typeof fetch;

    // 200 audio/mpeg + CORS
    const ok = await post({ text, lemma: "gato" });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("Content-Type"), "audio/mpeg");
    assert.equal(ok.headers.get("Cache-Control"), "no-store");
    assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(calls, 1);

    // upstream 500 → 502 ApiError JSON, one log line, no key or stack in the body
    upstreamStatus = 500;
    const bad = await post({ text: `${text} fail` });
    assert.equal(bad.status, 502);
    assert.match(bad.headers.get("Content-Type") ?? "", /application\/json/);
    assert.equal(bad.headers.get("Access-Control-Allow-Origin"), "*");
    const badBody = await bad.json();
    assert.deepEqual(Object.keys(badBody), ["error"]);
    assert.equal(typeof badBody.error, "string");
    assert.ok(
      !JSON.stringify(badBody).includes("test-key") && !JSON.stringify(badBody).includes("at "),
    );
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes("test-key"), "key is not logged");

    // invalid bodies → 400 (with CORS), no upstream call
    const before = calls;
    for (const b of [{}, { text: "" }, { text: "x".repeat(501) }, "not json"]) {
      const res = await post(b);
      assert.equal(res.status, 400);
      assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
      assert.equal(typeof (await res.json()).error, "string");
    }
    assert.equal(calls, before);

    // mock mode → 502, no upstream call
    process.env.TUTOR_MOCK = "1";
    const mock = await post({ text: `${text} mock` });
    assert.equal(mock.status, 502);
    assert.equal(typeof (await mock.json()).error, "string");
    assert.equal(calls, before);
    delete process.env.TUTOR_MOCK;

    // missing key → 502, not a throw
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal((await post({ text: `${text} nokey` })).status, 502);
    process.env.ELEVENLABS_API_KEY = "test-key";

    // preflight kept for the extension
    const pre = OPTIONS();
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "*");
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    for (const t of [text, `${text} fail`, `${text} mock`, `${text} nokey`]) {
      await rm(ttsCachePath(t, { voiceId: "voice_test" }), { force: true });
    }
    assert.ok(!existsSync(ttsCachePath(text, { voiceId: "voice_test" })), "cache file cleaned up");
    const restore = (k: string, v: string | undefined) =>
      v === undefined ? delete process.env[k] : (process.env[k] = v);
    restore("TUTOR_MOCK", saved.mock);
    restore("ELEVENLABS_API_KEY", saved.key);
    restore("ELEVENLABS_VOICE_ID", saved.voice);
  }
}

async function main() {
  await queueChecks();
  await routeChecks();
  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
