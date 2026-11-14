// Read-only tap on the tutor's voice for Luci's lip-sync.
// The audio queue (web/lib/tutor/client/audioQueue.ts, Andrew's) plays each TTS chunk as an
// AudioBufferSourceNode connected to ctx.destination. We don't touch that code: we wrap
// AudioNode.prototype.connect so that when a buffer source connects to the speakers, it ALSO feeds an
// AnalyserNode. The analyser goes through a silent gain node, so what you hear is unchanged.
// HACK: prototype patch, installed once, only in the browser, only when this module is loaded (tutor page).

type Tap = { analyser: AnalyserNode; active: number; time: Float32Array<ArrayBuffer>; freq: Uint8Array<ArrayBuffer> };

/** Fired on window whenever tutor audio starts or stops; read voicePlaying() for the new state. */
export const VOICE_EVENT = "luci-voice";

const taps = new WeakMap<BaseAudioContext, Tap>();
let latest: Tap | null = null;

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
    tap = {
      analyser,
      active: 0,
      time: new Float32Array(analyser.fftSize),
      freq: new Uint8Array(analyser.frequencyBinCount),
    };
    taps.set(ctx, tap);
  }
  return tap;
}

if (typeof window !== "undefined" && typeof AudioNode !== "undefined") {
  const w = window as unknown as { __luciVoiceTap?: boolean };
  if (!w.__luciVoiceTap) {
    w.__luciVoiceTap = true;
    const original = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      const result = original.apply(this, args);
      try {
        const dest = args[0];
        if (this instanceof AudioBufferSourceNode && dest === this.context.destination) {
          const tap = tapFor(this.context);
          original.call(this, tap.analyser);
          tap.active++;
          latest = tap;
          window.dispatchEvent(new Event(VOICE_EVENT));
          let done = false;
          this.addEventListener("ended", () => {
            if (done) return;
            done = true;
            tap.active = Math.max(0, tap.active - 1);
            window.dispatchEvent(new Event(VOICE_EVENT));
          });
        }
      } catch {
        // never let the tap break playback
      }
      return result;
    } as typeof AudioNode.prototype.connect;
  }
}

export function voicePlaying(): boolean {
  return !!latest && latest.active > 0;
}

/** Current voice level, or null when no tutor audio is playing (browser voice, mock, text-only). */
export function voiceLevel(): { rms: number; low: number } | null {
  const tap = latest;
  if (!tap || tap.active === 0) return null;
  tap.analyser.getFloatTimeDomainData(tap.time);
  let sum = 0;
  for (let i = 0; i < tap.time.length; i++) sum += tap.time[i] * tap.time[i];
  const rms = Math.sqrt(sum / tap.time.length);
  // Share of energy below ~700 Hz: high for round "o"/"u" sounds, lower for "a"/"e"/"i".
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

// Debug handle for checking the tap from the browser console: window.__luciVoiceLevel()
if (typeof window !== "undefined") (window as unknown as { __luciVoiceLevel?: typeof voiceLevel }).__luciVoiceLevel = voiceLevel;
