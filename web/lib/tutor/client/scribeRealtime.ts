/**
 * ElevenLabs Scribe Realtime client: one WebSocket per push-to-talk press, manual commit.
 * Runs in the browser and in Node 24 (eval/stt-test). No React, DOM or Node imports.
 * The committed transcript is returned exactly as received: never trimmed or edited.
 */
import { ELEVENLABS } from "../../config";
import type { ScribeClient, ScribeOptions, WebSocketCtor, WebSocketLike } from "../types";

const OPEN = 1;

function toBase64(pcm: Int16Array): string {
  // HACK: assumes a little-endian host (every browser and Node target we use), so the bytes are already s16le.
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function createScribeClient(opts: ScribeOptions): ScribeClient {
  const sampleRate = opts.sampleRate ?? 16000;
  const Impl = opts.WebSocketImpl ?? (globalThis.WebSocket as unknown as WebSocketCtor | undefined);
  if (!Impl) throw new Error("No WebSocket implementation available");

  // Never send previous_text; no_verbatim and transcript_edit stay off (their defaults).
  const params = new URLSearchParams({
    model_id: opts.model,
    token: opts.token,
    language_code: opts.languageCode ?? "es",
    audio_format: `pcm_${sampleRate}`,
    commit_strategy: "manual",
  });
  const ws: WebSocketLike = new Impl(`${ELEVENLABS.realtimeUrl}?${params.toString()}`);

  const queue: string[] = []; // messages waiting for the socket to open
  let failure: Error | null = null; // first error or close seen
  let closed = false;
  let pending: { resolve: (text: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> } | null =
    null;

  const closeSocket = () => {
    if (closed) return;
    closed = true;
    try {
      ws.close();
    } catch {
      // already closed
    }
  };

  const settle = (fn: (p: NonNullable<typeof pending>) => void) => {
    const p = pending;
    if (!p) return;
    pending = null;
    clearTimeout(p.timer);
    fn(p);
    closeSocket();
  };

  const fail = (err: Error) => {
    failure ??= err;
    settle((p) => p.reject(err));
  };

  const send = (pcm: Int16Array, commit: boolean) => {
    const msg = JSON.stringify({
      message_type: "input_audio_chunk",
      audio_base_64: toBase64(pcm),
      commit,
      sample_rate: sampleRate,
    });
    if (ws.readyState === OPEN) ws.send(msg);
    else queue.push(msg);
  };

  ws.onopen = () => {
    for (const msg of queue.splice(0)) ws.send(msg);
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    let msg: { message_type?: unknown; text?: unknown; error?: unknown };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const type = typeof msg.message_type === "string" ? msg.message_type : "";
    if (type === "partial_transcript") {
      if (typeof msg.text === "string") opts.onPartial?.(msg.text);
    } else if (type === "committed_transcript") {
      const text = typeof msg.text === "string" ? msg.text : "";
      settle((p) => p.resolve(text));
    } else if (type === "insufficient_audio_activity") {
      settle((p) => p.resolve(""));
    } else if ("error" in msg || type === "error" || type.endsWith("_error")) {
      const detail = typeof msg.error === "string" ? msg.error : JSON.stringify(msg.error ?? "");
      fail(new Error(`Scribe ${type || "error"}: ${detail}`));
    }
    // session_started and anything else: ignore.
  };

  ws.onerror = () => fail(new Error("Scribe WebSocket error"));
  ws.onclose = () => {
    closed = true;
    fail(new Error("Scribe WebSocket closed before the committed transcript"));
  };

  return {
    sendAudio(pcm) {
      if (closed || failure) return;
      send(pcm, false);
    },
    commit(lastChunk, timeoutMs) {
      if (failure) return Promise.reject(failure);
      if (closed) return Promise.reject(new Error("Scribe client is closed"));
      if (pending) return Promise.reject(new Error("Scribe commit already in progress"));
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => settle((p) => p.reject(new Error(`Scribe commit timed out after ${timeoutMs} ms`))),
          timeoutMs,
        );
        pending = { resolve, reject, timer };
        send(lastChunk, true);
      });
    },
    close() {
      settle((p) => p.reject(new Error("Scribe client closed")));
      closeSocket();
    },
  };
}
