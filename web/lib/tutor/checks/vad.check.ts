// Hands-free listening (D-023, fixes D-025): scripted level sequences for the cases that matter.
// Run from web/: npx tsx lib/tutor/checks/vad.check.ts
import assert from "node:assert/strict";
import { createVad, looksUnfinished, type VadContext, type VadEvent } from "../client/vad";

const QUIET = 0.005;
const SPEECH = 0.1;

/** Feed [level, ms] segments at 8 ms blocks (a real block). `ctx` may depend on time. Returns events with their time. */
function run(segments: [number, number][], ctx: (t: number) => VadContext) {
  const vad = createVad();
  const events: { at: number; ev: Exclude<VadEvent, null>; why: string }[] = [];
  let t = 0;
  for (const [level, ms] of segments) {
    for (let e = 0; e < ms; e += 8) {
      const ev = vad.push(level, (t += 8), ctx(t));
      if (ev) events.push({ at: t, ev, why: vad.info().last });
    }
  }
  return events;
}
const calib: [number, number] = [QUIET, 1100];
const plain = (partial = "") => () => ({ tutorSpeaking: false, partial });
/** A transcript that keeps changing until `endMs` (while the learner talks), then stops: like Scribe's partials. */
const growing = (endMs: number, text: string) => (t: number) => ({ tutorSpeaking: false, partial: text + " ".repeat(Math.floor(Math.min(t, endMs) / 200)) });
/** Lumo starts talking at `from` ms. */
const lucyFrom = (from: number) => (t: number) => ({ tutorSpeaking: t >= from, partial: "" });
const kinds = (e: { ev: string }[]) => e.map((x) => x.ev);

// A finished sentence: start, then end about 0.8 s after the last voice.
{
  const e = run([calib, [SPEECH, 1500], [QUIET, 1500]], growing(2600, "hola me llamo ana"));
  assert.deepEqual(kinds(e), ["start", "end"]);
  const gap = e[1].at - (1100 + 1500);
  assert.ok(gap >= 600 && gap <= 1100, `ends ~0.8 s after speech, got ${gap}`);
}
// A thinking pause: "ayer fui al…" must NOT end at 1.2 s, but does by ~2 s.
{
  assert.deepEqual(kinds(run([calib, [SPEECH, 800], [QUIET, 1200]], growing(1900, "ayer fui al"))), ["start"], "still waiting at 1.2 s");
  assert.deepEqual(kinds(run([calib, [SPEECH, 800], [QUIET, 2400]], growing(1900, "ayer fui al"))), ["start", "end"]);
}
assert.equal(looksUnfinished("ayer yo eh"), true);
assert.equal(looksUnfinished("Ayer fui al mercado."), false);
assert.equal(looksUnfinished(""), false);
assert.equal(looksUnfinished("sí"), true);

// THE BUG: the room gets louder after the first second (Chrome's auto-gain). Quiet is measured against the
// learner's own voice, so the turn still ends.
{
  const e = run([calib, [SPEECH, 1000], [0.02, 3000]], growing(2100, "hola me llamo ana"));
  assert.deepEqual(kinds(e), ["start", "end"], "a raised room still ends the turn");
}
// THE BUG: the level never drops, but the transcript stops changing: the words end the turn.
{
  const e = run([calib, [SPEECH, 800], [0.05, 3500]], plain("hola me llamo ana"));
  assert.deepEqual(kinds(e), ["start", "end"]);
  assert.equal(e[1].why, "end: partial stalled");
}
// Steady room noise never starts a turn, and a slowly louder room doesn't either.
assert.deepEqual(run([calib, [0.012, 5000]], plain()), []);
assert.deepEqual(run([calib, [0.01, 2000], [0.014, 2000], [0.018, 2000]], plain()), []);
// The cap ends a turn that nothing else does.
{
  const e = run([calib, [SPEECH, 17000]], plain(""));
  assert.deepEqual(kinds(e), ["start", "end"]);
  assert.equal(e[1].why, "end: cap");
}

// While Lumo talks. She starts at 1.1 s.
{
  const lucy = lucyFrom(1100);
  // A short "sí" (200 ms) is not a barge-in.
  assert.deepEqual(run([calib, [0.003, 1000], [SPEECH, 200], [0.003, 1500]], lucy), [], "backchannel ignored");
  // Headset: almost no echo, a normal voice interrupts.
  assert.deepEqual(kinds(run([calib, [0.003, 1500], [SPEECH, 400]], lucy)), ["start"], "headset barge-in");
  // Speakers: Lumo's voice at the mic (0.05) is learned, so it doesn't interrupt Lumo...
  assert.deepEqual(run([calib, [0.05, 4000]], lucy), [], "echo ignored");
  // ...but a louder learner over it does.
  assert.deepEqual(kinds(run([calib, [0.05, 2000], [0.25, 600]], lucy)), ["start"], "speaking up over echo");
  // Lumo's voice never raises the room-noise estimate: after Lumo stops, a normal sentence still starts a turn.
  assert.deepEqual(kinds(run([calib, [0.05, 3000], [QUIET, 500], [SPEECH, 600]], (t) => ({ tutorSpeaking: t >= 1100 && t < 4100, partial: "" }))), ["start"]);
}

console.log("ok");
