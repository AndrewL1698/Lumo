/**
 * Hands-free listening (D-023): decides when the learner starts and finishes a turn. Pure: no DOM, no clock.
 * It only fires "start" and "end"; the session turns those into the same pressTalk()/releaseTalk() a finger does.
 */
import { TUTOR } from "../../config";

export type VadConfig = typeof TUTOR.handsFree;
export type VadEvent = "start" | "end" | null;
export type VadContext = { tutorSpeaking: boolean; partial: string };

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
  /** Forget the current turn (the session is busy, or the mic was muted). The noise floor is kept. */
  reset(): void;
};

export function createVad(cfg: VadConfig = TUTOR.handsFree): Vad {
  let smooth = 0;
  let last: number | null = null;
  let floor = 0;
  let calibUntil: number | null = null;
  let calibSum = 0;
  let calibN = 0;
  let speaking = false;
  let loudMs = 0;
  let lastVoiceAt = 0;
  let speechStart = 0;

  return {
    push(rms, now, ctx) {
      const dt = last === null ? 8 : Math.min(100, Math.max(0, now - last));
      last = now;
      smooth += 0.25 * (rms - smooth); // ~30 ms of smoothing: single blocks are noisy
      if (calibUntil === null) calibUntil = now + cfg.calibMs;
      if (now < calibUntil) {
        calibSum += smooth;
        calibN += 1;
        floor = Math.min(0.03, calibSum / calibN); // a loud start must not deafen us
        return null;
      }

      const startLevel = Math.max(cfg.minStart, floor * cfg.startFactor);
      if (!speaking) {
        const bar = ctx.tutorSpeaking ? startLevel * cfg.bargeFactor : startLevel;
        const loud = smooth > bar;
        loudMs = loud ? loudMs + dt : 0;
        if (!loud && !ctx.tutorSpeaking) floor = Math.min(0.03, floor * 0.995 + smooth * 0.005); // follow the room slowly
        if (loudMs >= (ctx.tutorSpeaking ? cfg.bargeMs : cfg.startMs)) {
          speaking = true;
          loudMs = 0;
          lastVoiceAt = now;
          speechStart = now;
          return "start";
        }
        return null;
      }

      if (smooth > startLevel * cfg.endHysteresis) lastVoiceAt = now;
      const silence = now - lastVoiceAt;
      const need = looksUnfinished(ctx.partial) ? cfg.thinkSilenceMs : cfg.endSilenceMs;
      if (silence >= need || now - speechStart >= cfg.maxTurnMs) {
        speaking = false;
        loudMs = 0;
        return "end";
      }
      return null;
    },
    reset() {
      speaking = false;
      loudMs = 0;
    },
  };
}
