// Hands-free listening (D-023): scripted level sequences for the cases that matter. Run from web/: npx tsx lib/tutor/checks/vad.check.ts
import assert from "node:assert/strict";
import { createVad, looksUnfinished, type VadEvent } from "../client/vad";

const QUIET = 0.005;
const SPEECH = 0.1;

/** Feed [level, ms] segments at 8 ms blocks (a real block); returns the events with the time they fired. */
function run(segments: [number, number][], ctx: () => { tutorSpeaking: boolean; partial: string }) {
  const vad = createVad();
  const events: { at: number; ev: Exclude<VadEvent, null> }[] = [];
  let t = 0;
  for (const [level, ms] of segments) {
    for (let e = 0; e < ms; e += 8) {
      const ev = vad.push(level, (t += 8), ctx());
      if (ev) events.push({ at: t, ev });
    }
  }
  return events;
}
const calib: [number, number] = [QUIET, 1100];
const plain = (partial = "") => () => ({ tutorSpeaking: false, partial });

// A finished sentence: start, then end about 0.8 s after the last voice.
{
  const e = run([calib, [SPEECH, 1500], [QUIET, 1500]], plain("hola me llamo ana"));
  assert.deepEqual(e.map((x) => x.ev), ["start", "end"]);
  const gap = e[1].at - (1100 + 1500);
  assert.ok(gap >= 700 && gap <= 1000, `ends ~0.8 s after speech, got ${gap}`);
}
// A thinking pause: "ayer fui al…" must NOT end at 1.2 s, but does at ~1.8 s.
{
  const e = run([calib, [SPEECH, 800], [QUIET, 1200]], plain("ayer fui al"));
  assert.deepEqual(e.map((x) => x.ev), ["start"], "still waiting at 1.2 s");
  const e2 = run([calib, [SPEECH, 800], [QUIET, 2200]], plain("ayer fui al"));
  assert.deepEqual(e2.map((x) => x.ev), ["start", "end"]);
}
// A trailing filler waits too.
assert.equal(looksUnfinished("ayer yo eh"), true);
assert.equal(looksUnfinished("Ayer fui al mercado."), false);
assert.equal(looksUnfinished(""), false);
assert.equal(looksUnfinished("sí"), true);
// Steady room noise never starts a turn.
assert.deepEqual(run([calib, [0.012, 5000]], plain()), []);
// While Luci talks: a short "sí" (300 ms) is not a barge-in; real speech (700 ms) is.
{
  const talking = () => ({ tutorSpeaking: true, partial: "" });
  assert.deepEqual(run([calib, [SPEECH, 300], [QUIET, 1500]], talking), [], "backchannel ignored");
  assert.deepEqual(run([calib, [SPEECH, 700]], talking).map((x) => x.ev), ["start"], "real barge-in");
  // Her own voice coming back through the speakers is quieter than the learner: stays below the raised bar.
  assert.deepEqual(run([calib, [0.03, 3000]], talking), [], "echo ignored");
}
// A loud first second does not deafen it (floor is capped).
assert.deepEqual(run([[0.2, 1100], [SPEECH, 600]], plain()).map((x) => x.ev), ["start"]);

console.log("ok");
