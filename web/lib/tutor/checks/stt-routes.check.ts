/** Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/stt-routes.check.ts  (no network: fetch is faked) */
import assert from "node:assert/strict";
import {
  ApiError,
  rawTextFixture,
  SttBatchResponse,
  SttTokenResponse,
  sttTokenResponseFixture,
} from "@parrot/shared";
import { POST as sttBatchPost } from "../../../app/api/stt-batch/route";
import { GET as sttTokenGet } from "../../../app/api/stt-token/route";
import { ELEVENLABS } from "../../config";
import { encodeWav, floatToInt16 } from "../client/pttRecorder";

const ascii = (v: DataView, o: number) =>
  String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
const tokenReq = (q = "") => new Request(`http://localhost/api/stt-token${q}`);
const batchReq = (body: ArrayBuffer | string) =>
  new Request("http://localhost/api/stt-batch", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body,
  });

async function main() {
  // ---------- floatToInt16 ----------
  assert.deepEqual(
    Array.from(floatToInt16(new Float32Array([0, 1, -1, 2, -2, 0.5, -0.5, NaN]))),
    [0, 32767, -32768, 32767, -32768, 16384, -16384, 0],
  );

  // ---------- encodeWav ----------
  const samples = new Int16Array(1600);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.round(Math.sin(i / 5) * 20000);
  samples[0] = -32768;
  samples[1] = 32767;
  const wav = encodeWav(samples);
  const v = new DataView(wav);
  assert.equal(wav.byteLength, 44 + 3200);
  assert.equal(ascii(v, 0), "RIFF");
  assert.equal(v.getUint32(4, true), 36 + 3200);
  assert.equal(ascii(v, 8), "WAVE");
  assert.equal(ascii(v, 12), "fmt ");
  assert.equal(v.getUint32(16, true), 16);
  assert.equal(v.getUint16(20, true), 1, "PCM");
  assert.equal(v.getUint16(22, true), 1, "mono");
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(28, true), 32000, "byte rate");
  assert.equal(v.getUint16(32, true), 2, "block align");
  assert.equal(v.getUint16(34, true), 16, "bits");
  assert.equal(ascii(v, 36), "data");
  assert.equal(v.getUint32(40, true), 3200);
  const back = Array.from(samples, (_, i) => v.getInt16(44 + i * 2, true));
  assert.deepEqual(back, Array.from(samples), "samples round-trip");
  assert.equal(new DataView(encodeWav(samples, 44100)).getUint32(24, true), 44100);
  assert.equal(encodeWav(new Int16Array(0)).byteLength, 44);

  const pcmBytes = new Uint8Array(wav.slice(44));

  /** Same audio, but with a LIST chunk before `data` (so the header is not 44 bytes) and a trailing chunk. */
  const wavWithExtraChunks = (() => {
    const head = new Uint8Array(wav.slice(0, 36));
    const list = new Uint8Array(8 + 6); // "LIST" + size 5 + 5 bytes + 1 pad byte
    list.set([0x4c, 0x49, 0x53, 0x54, 5, 0, 0, 0]);
    const dataChunk = new Uint8Array(wav.slice(36));
    const trailer = new Uint8Array([0x6a, 0x75, 0x6e, 0x6b, 2, 0, 0, 0, 9, 9]); // "junk"
    const out = new Uint8Array(head.length + list.length + dataChunk.length + trailer.length);
    out.set(head, 0);
    out.set(list, head.length);
    out.set(dataChunk, head.length + list.length);
    out.set(trailer, head.length + list.length + dataChunk.length);
    return out.buffer;
  })();

  const realFetch = globalThis.fetch;
  const realError = console.error;
  const errorLines: string[] = [];
  console.error = (...a: unknown[]) => void errorLines.push(a.map(String).join(" "));
  const savedMock = process.env.TUTOR_MOCK;
  const savedKey = process.env.ELEVENLABS_API_KEY;

  try {
    // ---------- mock mode: no fetch at all ----------
    process.env.TUTOR_MOCK = "1";
    globalThis.fetch = (() => {
      throw new Error("mock mode must not call fetch");
    }) as typeof fetch;

    let res: Response = await sttTokenGet(tokenReq());
    assert.equal(res.status, 200);
    assert.deepEqual(SttTokenResponse.parse(await res.json()), sttTokenResponseFixture);

    res = await sttBatchPost(batchReq(wav));
    assert.equal(res.status, 200);
    assert.deepEqual(SttBatchResponse.parse(await res.json()), { text: rawTextFixture });

    // ---------- bad bodies → 400 (mock or not) ----------
    const mp3ish = new Uint8Array(400).fill(0x55).buffer;
    const stereo = encodeWav(samples);
    new DataView(stereo).setUint16(22, 2, true);
    const rate44 = encodeWav(samples, 44100);
    const eightBit = encodeWav(samples);
    new DataView(eightBit).setUint16(34, 8, true);
    const tooLong = encodeWav(new Int16Array(16000 * 41));
    const noData = wav.slice(0, 36);
    for (const mock of ["1", undefined]) {
      if (mock) process.env.TUTOR_MOCK = mock;
      else delete process.env.TUTOR_MOCK;
      for (const [name, body] of Object.entries({
        mp3ish,
        stereo,
        rate44,
        eightBit,
        tooLong,
        noData,
        text: "hola",
        empty: "",
      })) {
        const r = await sttBatchPost(batchReq(body));
        assert.equal(r.status, 400, `${name} → 400`);
        assert.ok(ApiError.parse(await r.json()).error.length > 0);
      }
    }
    assert.equal(errorLines.length, 0, "400s are not logged as failures");

    // ---------- real mode with a fake fetch ----------
    delete process.env.TUTOR_MOCK;
    process.env.ELEVENLABS_API_KEY = "test-key";
    type Call = { url: string; init: RequestInit };
    const calls: Call[] = [];
    const RAW = "  eh, yo tiene la problema...  "; // must come back byte-for-byte, spaces included
    let fail = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      assert.ok(url.startsWith(ELEVENLABS.apiBase), "only ElevenLabs is called");
      if (fail) return new Response("upstream exploded test-key", { status: 500 });
      if (url.includes("/single-use-token/")) return Response.json({ token: "fake-token" });
      if (url.endsWith("/v1/speech-to-text")) return Response.json({ text: RAW });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    res = await sttTokenGet(tokenReq());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { token: "fake-token", model: ELEVENLABS.sttRealtimeModel });
    assert.equal(new Headers(calls[0].init.headers).get("xi-api-key"), "test-key");

    res = await sttTokenGet(tokenReq("?model=scribe_v3_live"));
    assert.deepEqual(await res.json(), { token: "fake-token", model: "scribe_v3_live" });

    res = await sttTokenGet(tokenReq("?model=bogus"));
    assert.deepEqual(await res.json(), { token: "fake-token", model: ELEVENLABS.sttRealtimeModel });

    for (const body of [wav, wavWithExtraChunks]) {
      calls.length = 0;
      res = await sttBatchPost(batchReq(body));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { text: RAW }, "transcript is returned untouched");
      assert.equal(calls.length, 1);
      const form = calls[0].init.body as FormData;
      assert.ok(form instanceof FormData);
      assert.equal(form.get("file_format"), "pcm_s16le_16");
      assert.equal(form.get("language_code"), "es");
      assert.equal(form.get("model_id"), ELEVENLABS.sttBatchModel);
      const sent = new Uint8Array(await (form.get("file") as Blob).arrayBuffer());
      assert.equal(sent.length, 3200, "PCM only: no WAV header, no other chunks");
      assert.deepEqual(sent, pcmBytes);
    }

    // ---------- upstream 500 → 502 JSON, no stack, no key ----------
    fail = true;
    for (const r of [await sttTokenGet(tokenReq()), await sttBatchPost(batchReq(wav))]) {
      assert.equal(r.status, 502);
      assert.match(r.headers.get("content-type") ?? "", /application\/json/);
      const text = await r.text();
      assert.deepEqual(Object.keys(ApiError.parse(JSON.parse(text))), ["error"]);
      assert.ok(
        !/test-key|upstream exploded|\bat .+:\d+|Error:|node_modules|\.ts\b/.test(text),
        `leaky body: ${text}`,
      );
    }
    assert.equal(errorLines.length, 2, "one console.error line per failure");
    for (const line of errorLines) {
      assert.ok(!line.includes("\n") && !line.includes("test-key"), `log line: ${line}`);
    }

    // ---------- missing key → 502, not a throw ----------
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal((await sttTokenGet(tokenReq())).status, 502);
    assert.equal((await sttBatchPost(batchReq(wav))).status, 502);
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    if (savedMock === undefined) delete process.env.TUTOR_MOCK;
    else process.env.TUTOR_MOCK = savedMock;
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
  }

  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
