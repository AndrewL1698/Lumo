// Read-only tap on the tutor's voice for Luci's lip-sync. Andrew's audio queue
// (web/lib/tutor/client/audioQueue.ts) is NOT changed; we only observe it:
//  - ElevenLabs mode: fetch("/api/tts", {text}) -> res.arrayBuffer() -> ctx.decodeAudioData(buf) ->
//    an AudioBufferSourceNode connected to ctx.destination. We remember which text each buffer came from,
//    and when a source connects to the speakers we also feed a muted AnalyserNode (loudness) and note
//    the clip's start time and duration. What you hear is unchanged.
//  - Browser-voice mode: speechSynthesis.speak(utterance). We add listeners for start / word boundary /
//    end to the same utterance.
// HACK: these are browser-API wrappers, installed once, only when this module loads (tutor page only).

/** Fired on window whenever tutor speech starts or stops. */
export const VOICE_EVENT = "luci-voice";

/** What the tutor is saying right now. Times are performance.now() milliseconds. */
export type Speech = {
  kind: "audio" | "synth";
  text: string | null; // null if we could not match the clip to its text
  start: number;
  duration: number | null; // known for ElevenLabs clips; null for the browser voice
  anchor: { char: number; t: number } | null; // last word boundary (browser voice)
};

type Tap = { analyser: AnalyserNode; time: Float32Array<ArrayBuffer>; freq: Uint8Array<ArrayBuffer> };

const taps = new WeakMap<BaseAudioContext, Tap>();
const textOfBytes = new WeakMap<ArrayBuffer, string>();
const textOfBuffer = new WeakMap<AudioBuffer, string>();
let speech: Speech | null = null;
let heard = false; // any real tutor voice played this page load
let speechTap: Tap | null = null;

const fire = () => {
  if (speech) heard = true;
  window.dispatchEvent(new Event(VOICE_EVENT));
};

function tapFor(ctx: BaseAudioContext): Tap {
  let tap = taps.get(ctx);
  if (!tap) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    analyser.connect(mute);
    mute.connect(ctx.destination);
    tap = { analyser, time: new Float32Array(analyser.fftSize), freq: new Uint8Array(analyser.frequencyBinCount) };
    taps.set(ctx, tap);
  }
  return tap;
}

function install() {
  const w = window as unknown as { __luciVoiceTap?: boolean };
  if (w.__luciVoiceTap) return;
  w.__luciVoiceTap = true;

  // 1. Remember the text of each /api/tts response's bytes.
  const origFetch = window.fetch;
  window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const res = await origFetch.call(this, input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (res.ok && url.includes("/api/tts") && typeof init?.body === "string") {
        const text = (JSON.parse(init.body) as { text?: unknown }).text;
        if (typeof text === "string") {
          const read = res.arrayBuffer.bind(res);
          res.arrayBuffer = async () => {
            const bytes = await read();
            textOfBytes.set(bytes, text);
            return bytes;
          };
        }
      }
    } catch {
      // observation only; never affect the request
    }
    return res;
  } as typeof window.fetch;

  // 2. Carry that text over to the decoded AudioBuffer.
  const origDecode = BaseAudioContext.prototype.decodeAudioData as (...a: unknown[]) => Promise<AudioBuffer>;
  BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, bytes: ArrayBuffer, ...rest: unknown[]) {
    const text = textOfBytes.get(bytes);
    const p = origDecode.call(this, bytes, ...rest);
    if (text) p.then((buf) => textOfBuffer.set(buf, text), () => {});
    return p;
  } as typeof BaseAudioContext.prototype.decodeAudioData;

  // 3. When a clip connects to the speakers: loudness tap + timing.
  const origConnect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    const result = origConnect.apply(this, args);
    try {
      if (this instanceof AudioBufferSourceNode && args[0] === this.context.destination) {
        const tap = tapFor(this.context);
        origConnect.call(this, tap.analyser);
        const buf = this.buffer;
        const sp: Speech = {
          kind: "audio",
          text: buf ? (textOfBuffer.get(buf) ?? null) : null,
          start: performance.now(),
          duration: buf ? buf.duration * 1000 : null,
          anchor: null,
        };
        speech = sp;
        speechTap = tap;
        fire();
        this.addEventListener("ended", () => {
          if (speech === sp) {
            speech = null;
            fire();
          }
        });
      }
    } catch {
      // never let the tap break playback
    }
    return result;
  } as typeof AudioNode.prototype.connect;

  // 4. Browser voice: listen to the utterance's own events.
  const synth = window.speechSynthesis;
  if (synth) {
    const origSpeak = synth.speak.bind(synth);
    const origCancel = synth.cancel.bind(synth);
    synth.speak = (utt: SpeechSynthesisUtterance) => {
      try {
        const sp: Speech = { kind: "synth", text: utt.text, start: performance.now(), duration: null, anchor: null };
        utt.addEventListener("start", () => {
          sp.start = performance.now();
          speech = sp;
          speechTap = null;
          fire();
        });
        utt.addEventListener("boundary", (e) => {
          if (speech === sp && e.name === "word") sp.anchor = { char: e.charIndex, t: performance.now() };
        });
        const end = () => {
          if (speech === sp) {
            speech = null;
            fire();
          }
        };
        utt.addEventListener("end", end);
        utt.addEventListener("error", end);
      } catch {
        // observation only
      }
      origSpeak(utt);
    };
    synth.cancel = () => {
      if (speech?.kind === "synth") {
        speech = null;
        fire();
      }
      origCancel();
    };
  }
}

if (typeof window !== "undefined" && typeof AudioNode !== "undefined") install();

export function currentSpeech(): Speech | null {
  return speech;
}

/** True once any real tutor voice has played; until then Luci may follow the reply text instead. */
export function heardVoice(): boolean {
  return heard;
}

export function voicePlaying(): boolean {
  return speech !== null;
}

/** Loudness of the playing ElevenLabs clip, or null (browser voice, mock, nothing playing). */
export function voiceLevel(): { rms: number; low: number } | null {
  const tap = speechTap;
  if (!tap || speech?.kind !== "audio") return null;
  tap.analyser.getFloatTimeDomainData(tap.time);
  let sum = 0;
  for (let i = 0; i < tap.time.length; i++) sum += tap.time[i] * tap.time[i];
  const rms = Math.sqrt(sum / tap.time.length);
  // Share of energy below ~700 Hz: high for round "o"/"u" sounds.
  tap.analyser.getByteFrequencyData(tap.freq);
  const binHz = tap.analyser.context.sampleRate / tap.analyser.fftSize;
  const cut = Math.round(700 / binHz);
  let lo = 0;
  let all = 0;
  for (let i = 2; i < tap.freq.length / 2; i++) {
    all += tap.freq[i];
    if (i < cut) lo += tap.freq[i];
  }
  return { rms, low: all ? lo / all : 0 };
}

// Debug handles for checking from the browser console.
if (typeof window !== "undefined") {
  const w = window as unknown as { __luciVoiceLevel?: typeof voiceLevel; __luciSpeech?: typeof currentSpeech };
  w.__luciVoiceLevel = voiceLevel;
  w.__luciSpeech = currentSpeech;
}
