/**
 * Tutor audio queue (voice-plan §1.4). Fetches start at enqueue() and run in parallel; playback is one
 * chunk at a time, in (turn, index) order. The ordering/stop logic touches no DOM: fetchAudio and decode
 * are injectable, so checks/audio.check.ts runs it under Node.
 */
import type { AudioQueue } from "../types";

/** One decoded chunk. `at` is a delay in seconds from now (the queue always passes 0). */
export type Playable = {
  duration: number;
  play(at: number, onStart: () => void, onEnd: () => void): { stop(): void };
};

export type AudioQueueOptions = {
  mode?: "elevenlabs" | "browser";
  fetchAudio?: (text: string, signal: AbortSignal) => Promise<ArrayBuffer>;
  decode?: (buf: ArrayBuffer) => Promise<Playable>;
  onChunkFailed?: (turn: number, index: number) => void;
};

type Item = {
  turn: number;
  index: number;
  state: "loading" | "ready" | "playing";
  playable?: Playable;
  handle?: { stop(): void };
  onStart?: () => void;
};

async function defaultFetchAudio(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  return res.arrayBuffer();
}

let sharedCtx: AudioContext | null = null;

async function defaultDecode(buf: ArrayBuffer): Promise<Playable> {
  sharedCtx ??= new AudioContext();
  const ctx = sharedCtx;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const audio = await ctx.decodeAudioData(buf);
  return {
    duration: audio.duration,
    play(at, onStart, onEnd) {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(ctx.destination);
      src.onended = onEnd;
      src.start(ctx.currentTime + at);
      const timer = at > 0 ? setTimeout(onStart, at * 1000) : undefined;
      if (at <= 0) onStart();
      return {
        stop() {
          src.onended = null;
          clearTimeout(timer);
          try {
            src.stop();
          } catch {
            // already stopped
          }
          src.disconnect();
        },
      };
    },
  };
}

/** Built-in voice (NEXT_PUBLIC_TTS_MODE=browser): zero credits, no fetch. */
function speechPlayable(text: string): Playable {
  return {
    duration: 0,
    play(_at, onStart, onEnd) {
      const synth = window.speechSynthesis;
      const voices = synth.getVoices();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "es-MX";
      const voice =
        voices.find((v) => v.lang === "es-MX") ?? voices.find((v) => v.lang.startsWith("es"));
      if (voice) utt.voice = voice;
      let stopped = false;
      utt.onstart = () => {
        if (!stopped) onStart();
      };
      utt.onend = utt.onerror = () => {
        if (!stopped) onEnd();
      };
      synth.speak(utt);
      return {
        stop() {
          stopped = true;
          synth.cancel();
        },
      };
    },
  };
}

export function createAudioQueue(opts: AudioQueueOptions = {}): AudioQueue {
  const mode =
    opts.mode ?? (process.env.NEXT_PUBLIC_TTS_MODE === "browser" ? "browser" : "elevenlabs");
  const fetchAudio = opts.fetchAudio ?? defaultFetchAudio;
  const decode = opts.decode ?? defaultDecode;

  /** Bumped by stopAll(); anything started under an older generation is ignored. */
  let gen = 0;
  let abort = new AbortController();
  /** Unfinished chunks, sorted by (turn, index). Finished and failed chunks are removed. */
  let items: Item[] = [];
  let current: Item | null = null;
  let waiters: { turn: number; resolve: () => void }[] = [];

  function settle() {
    const stillBusy = (turn: number) => items.some((it) => it.turn === turn);
    const done = waiters.filter((w) => !stillBusy(w.turn));
    waiters = waiters.filter((w) => stillBusy(w.turn));
    for (const w of done) w.resolve();
  }

  function drop(item: Item, failed: boolean) {
    items = items.filter((it) => it !== item);
    if (current === item) current = null;
    if (failed) {
      try {
        opts.onChunkFailed?.(item.turn, item.index);
      } catch {
        // a throwing callback must not stall the queue
      }
    }
    settle();
    pump();
  }

  function pump() {
    if (current) return;
    const head = items[0];
    if (!head || head.state !== "ready" || !head.playable) return; // head still loading: later chunks wait
    const myGen = gen;
    head.state = "playing";
    current = head;
    let started = false;
    let ended = false;
    try {
      const handle = head.playable.play(
        0,
        () => {
          if (started || ended || myGen !== gen) return;
          started = true;
          head.onStart?.();
        },
        () => {
          if (ended || myGen !== gen) return;
          ended = true;
          drop(head, false);
        },
      );
      head.handle = handle;
      if (myGen !== gen) handle.stop(); // stopAll() ran inside play()
    } catch {
      if (!ended && myGen === gen) {
        ended = true;
        drop(head, true);
      }
    }
  }

  return {
    enqueue(turn, index, text, onStart) {
      if (items.some((it) => it.turn === turn && it.index === index)) return;
      const item: Item = { turn, index, state: "loading", onStart };
      items.push(item);
      items.sort((a, b) => a.turn - b.turn || a.index - b.index);
      const myGen = gen;
      const signal = abort.signal;
      const load =
        mode === "browser"
          ? Promise.resolve().then(() => speechPlayable(text))
          : Promise.resolve()
              .then(() => fetchAudio(text, signal))
              .then((buf) => (myGen === gen ? decode(buf) : null));
      load.then(
        (playable) => {
          if (myGen !== gen || !playable) return; // stopped meanwhile: drop the late result
          item.playable = playable;
          item.state = "ready";
          pump();
        },
        () => {
          if (myGen !== gen) return; // aborted by stopAll(), not a real failure
          drop(item, true);
        },
      );
    },

    stopAll() {
      gen++;
      abort.abort();
      abort = new AbortController();
      const playing = current;
      const resolved = waiters;
      items = [];
      current = null;
      waiters = [];
      try {
        playing?.handle?.stop();
      } catch {
        // ignore
      }
      for (const w of resolved) w.resolve();
    },

    idle(turn) {
      if (!items.some((it) => it.turn === turn)) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push({ turn, resolve }));
    },
  };
}
