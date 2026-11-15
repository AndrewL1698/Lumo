/**
 * Hands-free listening (D-023): decides when the learner starts and finishes a turn. Pure: no DOM, no clock.
 * It only fires "start" and "end"; the session turns those into the same pressTalk()/releaseTalk() a finger does.
 */
import { TUTOR } from "../../config";

export type VadConfig = typeof TUTOR.handsFree;
export type VadEvent = "start" | "end" | null;
export type VadContext = { tutorSpeaking: boolean; partial: string };

/** What the listener currently believes, for the ?debug=1 meter and the console log. */
export type VadInfo = {
  state: "idle" | "speaking";
  level: number;
  floor: number;
  startLevel: number;
  silenceLevel: number;
  echo: number;
  peak: number;
  /** The last event and why: "start", "end: silence", "end: partial stalled", "end: cap". */
  last: string;
};

// A turn that stops here is probably a pause to think, not the end of the thought.
const FILLERS = new Set(["eh", "em", "este", "mmm", "mm", "hmm", "um", "uh", "ah", "o sea", "bueno"]);
const CONNECTORS = new Set([
  "y", "e", "o", "pero", "que", "de", "del", "en", "a", "al", "con", "por", "para", "porque", "como", "si", "cuando",
  "el", "la", "los", "las", "un", "una", "unos", "unas", "mi", "tu", "su", "me", "te", "se", "lo",
]);

/** True when the partial transcript reads like an unfinished thought. An empty partial (no transcript yet) is not. */
export function looksUnfinished(partial: string): boolean {
  const text = partial.trim().toLowerCase();
  if (!text) return false;
  if (/[,…]$|\.\.\.$/.test(text)) return true;
  const words = text.replace(/[¿?¡!.,;:…]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 2) return true; // a single word is usually the start of something
  const last = words[words.length - 1];
  return FILLERS.has(last) || CONNECTORS.has(last);
}

export type Vad = {
  /** One level reading (RMS of a block) at time `nowMs`. */
  push(rms: number, nowMs: number, ctx: VadContext): VadEvent;
  /** Forget the current turn (the session is busy, or the mic was muted). The room-noise estimate is kept. */
  reset(): void;
  info(): VadInfo;
};

export function createVad(cfg: VadConfig = TUTOR.handsFree): Vad {
  let smooth = 0;
  let last: number | null = null;
  let floor = 0; // room noise: drops at once, rises slowly, never learns from speech or from Luci
  let calibUntil: number | null = null;
  let speaking = false;
  let loudMs = 0;
  let lastVoiceAt = 0;
  let speechStart = 0;
  let peak = 0; // how loud the learner was this turn (decays slowly)
  let echo = 0; // Luci's own voice as the mic hears it
  let tutorWas = false;
  let tutorSince = 0;
  let seenPartial = "";
  let partialAt = 0;
  let lastEvent = "";
  let startLevel: number = cfg.minStart;
  let silenceLevel: number = cfg.minStart;

  return {
    push(rms, now, ctx) {
      const dt = last === null ? 8 : Math.min(100, Math.max(0, now - last));
      last = now;
      smooth += 0.25 * (rms - smooth); // ~30 ms of smoothing: single blocks are noisy
      if (calibUntil === null) {
        calibUntil = now + cfg.calibMs;
        floor = smooth;
      }

      // Room noise: follows the room (auto-gain raises it, a fan changes it). Frozen while someone is talking.
      if (!speaking && !ctx.tutorSpeaking && loudMs === 0) {
        floor = Math.min(0.05, smooth < floor ? smooth : floor + cfg.floorRise * (smooth - floor));
      }
      startLevel = Math.max(cfg.minStart, floor * cfg.startFactor);

      // Luci's echo: learned fast for a moment after she starts (that is when it is safe to tell it from the
      // learner), slowly after, and not while a possible interruption is under way.
      if (ctx.tutorSpeaking && !tutorWas) tutorSince = now;
      tutorWas = ctx.tutorSpeaking;
      const learning = ctx.tutorSpeaking && now - tutorSince < cfg.echoLearnMs;
      if (ctx.tutorSpeaking) {
        if (learning) echo += 0.1 * (smooth - echo);
        else if (loudMs === 0) echo += 0.01 * (smooth - echo);
      } else echo *= 0.9;

      if (now < calibUntil) return null;

      if (!speaking) {
        const bar = ctx.tutorSpeaking ? Math.max(startLevel, echo * cfg.bargeEchoFactor) : startLevel;
        const loud = !learning && smooth > bar;
        loudMs = loud ? loudMs + dt : 0;
        if (loudMs >= (ctx.tutorSpeaking ? cfg.bargeMs : cfg.startMs)) {
          speaking = true;
          loudMs = 0;
          peak = smooth;
          lastVoiceAt = now;
          speechStart = now;
          seenPartial = ctx.partial;
          partialAt = now;
          lastEvent = "start";
          return "start";
        }
        return null;
      }

      // Speaking. "Quiet" is relative to how loud the learner just was, so a room made louder by auto-gain still
      // counts as quiet once they stop.
      peak = Math.max(smooth, peak * 0.9995);
      silenceLevel = Math.max(floor * cfg.silenceFloorFactor, peak * cfg.silencePeakShare, cfg.minStart * 0.5);
      if (smooth > silenceLevel) lastVoiceAt = now;
      if (ctx.partial !== seenPartial) {
        seenPartial = ctx.partial;
        partialAt = now;
      }
      const need = looksUnfinished(ctx.partial) ? cfg.thinkSilenceMs : cfg.endSilenceMs;
      let why: string | null = null;
      if (now - lastVoiceAt >= need) why = "silence";
      // Words stalled AND clearly not at speaking volume: never cuts off someone still talking loudly.
      else if (ctx.partial.trim() && now - partialAt >= need + cfg.partialStallExtraMs && smooth < peak * 0.6) why = "partial stalled";
      else if (now - speechStart >= cfg.maxTurnMs) why = "cap";
      if (!why) return null;
      speaking = false;
      loudMs = 0;
      floor = Math.min(0.05, smooth); // after the silence that ended the turn, this level is the room
      lastEvent = `end: ${why}`;
      return "end";
    },
    reset() {
      speaking = false;
      loudMs = 0;
    },
    info() {
      return { state: speaking ? "speaking" : "idle", level: smooth, floor, startLevel, silenceLevel, echo, peak, last: lastEvent };
    },
  };
}
