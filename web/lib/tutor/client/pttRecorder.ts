/**
 * Push-to-talk mic capture (voice-plan §1.1): 16 kHz mono PCM16 from an AudioWorklet.
 * One buffer feeds the realtime socket (chunks), the batch fallback (whole take) and test recordings.
 * `encodeWav` / `floatToInt16` use no DOM, so they also run under Node.
 */
import { TUTOR } from "../../config";
import type { PttRecorder } from "../types";

const CHUNK_SAMPLES = TUTOR.sampleRate / 10; // ~100 ms
const WORKLET_URL = "/pcm-worklet.js";

/** Float [-1, 1] → PCM16, clamped. NaN becomes 0. */
export function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i] || 0));
    out[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return out;
}

/** 44-byte RIFF header + little-endian samples. Mono, 16-bit. */
export function encodeWav(pcm: Int16Array, sampleRate: number = TUTOR.sampleRate): ArrayBuffer {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const tag = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  tag(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
  return buf;
}

type Take = { pcm: Int16Array; tail: Int16Array; durationMs: number };
const EMPTY_TAKE = (): Take => ({ pcm: new Int16Array(0), tail: new Int16Array(0), durationMs: 0 });

export function createPttRecorder(): PttRecorder {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let initing: Promise<void> | null = null;

  // One take at a time. `buf` is sized for the longest allowed hold, so capture stops by itself at maxHoldMs.
  let buf: Int16Array | null = null;
  let total = 0; // samples captured so far
  let emitted = 0; // samples already handed to onChunk
  let stopAt: number | null = null; // `total` when stop() was called
  let tailSamples = 0;
  let onChunk: ((pcm: Int16Array) => void) | null = null;
  let stopping: Promise<Take> | null = null;
  let resolveStop: ((t: Take) => void) | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  function finish() {
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    const rate = ctx?.sampleRate ?? TUTOR.sampleRate;
    const take: Take = buf
      ? {
          pcm: buf.slice(0, total),
          tail: buf.slice(emitted, total),
          durationMs: Math.round((total / rate) * 1000),
        }
      : EMPTY_TAKE();
    buf = null;
    onChunk = null;
    stopAt = null;
    const done = resolveStop;
    resolveStop = null;
    stopping = null;
    done?.(take);
  }

  function onBlock(block: Float32Array) {
    if (!buf) return;
    const room = buf.length - total;
    if (room > 0) {
      const pcm = floatToInt16(room < block.length ? block.subarray(0, room) : block);
      buf.set(pcm, total);
      total += pcm.length;
    }
    if (stopAt === null) {
      // Still holding: emit whole ~100 ms chunks. After stop() nothing more is emitted; the rest goes out as `tail`.
      while (total - emitted >= CHUNK_SAMPLES) {
        const chunk = buf.slice(emitted, emitted + CHUNK_SAMPLES);
        emitted += CHUNK_SAMPLES;
        try {
          onChunk?.(chunk);
        } catch (err) {
          console.error("[pttRecorder] onChunk threw", err);
        }
      }
    } else if (total >= stopAt + tailSamples || total >= buf.length) {
      finish();
    }
  }

  async function doInit() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      // Chrome resamples the mic to the context rate, so the worklet already sees 16 kHz.
      ctx = new AudioContext({ sampleRate: TUTOR.sampleRate });
      if (ctx.sampleRate !== TUTOR.sampleRate) {
        // HACK: no resampler; only Chrome is promised for the demo.
        console.warn(
          `[pttRecorder] AudioContext is ${ctx.sampleRate} Hz, expected ${TUTOR.sampleRate}`,
        );
      }
      await ctx.audioWorklet.addModule(WORKLET_URL);
      node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data);
      const mute = ctx.createGain();
      mute.gain.value = 0; // keeps the graph pulled without playing the mic back
      ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    } catch (err) {
      teardown();
      throw err;
    }
  }

  function teardown() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (node) node.port.onmessage = null;
    node?.disconnect();
    node = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctx = null;
    initing = null;
  }

  return {
    init() {
      initing ??= doInit();
      return initing;
    },

    start(cb) {
      if (!ctx || !node) throw new Error("pttRecorder: call init() before start()");
      if (buf) finish(); // a press during the previous take's tail ends that take now
      if (ctx.state === "suspended") void ctx.resume().catch(() => {}); // start() runs inside the key/pointer gesture
      buf = new Int16Array(Math.round((TUTOR.maxHoldMs / 1000) * ctx.sampleRate));
      total = 0;
      emitted = 0;
      stopAt = null;
      onChunk = cb;
    },

    stop(tailMs) {
      if (stopping) return stopping;
      if (!buf) return Promise.resolve(EMPTY_TAKE());
      const rate = ctx?.sampleRate ?? TUTOR.sampleRate;
      stopAt = total;
      tailSamples = Math.max(0, Math.round((tailMs / 1000) * rate));
      stopping = new Promise<Take>((resolve) => {
        resolveStop = resolve;
      });
      const p = stopping;
      if (tailSamples === 0 || total >= buf.length) finish();
      // Normally the worklet delivers the tail and finishes; the timer covers a stalled audio thread.
      else stopTimer = setTimeout(finish, tailMs + 250);
      return p;
    },

    dispose() {
      if (buf) finish();
      teardown();
    },
  };
}
