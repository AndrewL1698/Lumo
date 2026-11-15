/** Run: npx tsx web/lib/tutor/checks/policy.check.ts */
import assert from "node:assert/strict";
import { correctResponseFixture } from "@parrot/shared";
import { errorKey, nextDirective, WHY } from "../policy";
import { getSession, noteSpokenCorrection, recordCorrection, resetSessions, setSessionContext } from "../session";
import type { PolicyState } from "../types";

const errors = correctResponseFixture.correction.errors;
const used = correctResponseFixture.correction.target_words_used;
const example = { span: "la problema", correction: "el problema", reason: "masculine" };

const base = (over: Partial<PolicyState> = {}): PolicyState => ({
  turnIndex: 0,
  lastSpokenCorrectionTurn: null,
  errorCounts: {},
  errorExamples: {},
  lastErrors: [],
  targetLemmas: ["huelga", "aprovechar", "casa"],
  usedLemmas: [],
  ...over,
});

// errorKey
assert.equal(errorKey(errors[0]), "conjugation:tener");
assert.equal(errorKey({ ...errors[1], lemma: null, span: "La Problema" }), "agreement:la problema");

// opener flag only at turn 0
assert.equal(nextDirective(base()).isOpener, true);
for (const t of [1, 2, 3, 7]) assert.equal(nextDirective(base({ turnIndex: t })).isOpener, false);

// no explicit correction before 3 turns have passed, even with a key at count 2
const repeated = { errorCounts: { "agreement:problema": 2 }, errorExamples: { "agreement:problema": example } };
for (const t of [0, 1, 2]) assert.equal(nextDirective(base({ turnIndex: t, ...repeated })).correction, "none");

// turn >= 3 but nothing repeated → none
assert.equal(
  nextDirective(base({ turnIndex: 3, errorCounts: { "agreement:problema": 1 }, errorExamples: repeated.errorExamples }))
    .correction,
  "none",
);

// same key twice and turn >= 3 → explicit correction, most frequent key wins
assert.deepEqual(nextDirective(base({ turnIndex: 3, ...repeated })).correction, example);
const tenerExample = { span: "yo tiene", correction: "yo tengo", reason: "yo form" };
assert.deepEqual(
  nextDirective(
    base({
      turnIndex: 5,
      errorCounts: { "agreement:problema": 2, "conjugation:tener": 3, "word_choice:x": 1 },
      errorExamples: { "agreement:problema": example, "conjugation:tener": tenerExample },
    }),
  ).correction,
  tenerExample,
);

// after a spoken correction at turn 3: none on turns 4 and 5, allowed again at 6
for (const t of [4, 5]) {
  assert.equal(nextDirective(base({ turnIndex: t, lastSpokenCorrectionTurn: 3, ...repeated })).correction, "none");
}
assert.deepEqual(nextDirective(base({ turnIndex: 6, lastSpokenCorrectionTurn: 3, ...repeated })).correction, example);

// steerLemma: even turns from 2, skips used targets, null when all used
for (const t of [0, 1, 3, 5]) assert.equal(nextDirective(base({ turnIndex: t })).steerLemma, null);
assert.equal(nextDirective(base({ turnIndex: 2 })).steerLemma, "huelga");
assert.equal(nextDirective(base({ turnIndex: 4, usedLemmas: ["huelga"] })).steerLemma, "aprovechar");
assert.equal(nextDirective(base({ turnIndex: 4, usedLemmas: ["huelga", "aprovechar", "casa"] })).steerLemma, null);

// J1 why: set in every branch, short, and correction > steer > repeated-but-waiting > seen once > talking
const whyOf = (over: Partial<PolicyState>) => nextDirective(base(over)).why;
assert.equal(whyOf({}), WHY.opener);
assert.equal(
  whyOf({ turnIndex: 4, ...repeated }), // turn 4 also steers: correction wins
  "Explained out loud: 'la problema' has come up 2 times",
);
assert.equal(whyOf({ turnIndex: 2 }), "Steering toward 'huelga'");
assert.equal(whyOf({ turnIndex: 2, ...repeated }), "Steering toward 'huelga'"); // too early to correct, so steer
assert.equal(whyOf({ turnIndex: 1, ...repeated }), "Recasting quietly: Luci spaces out spoken corrections");
assert.equal(
  whyOf({ turnIndex: 5, lastSpokenCorrectionTurn: 3, ...repeated }),
  "Recasting quietly: Luci spaces out spoken corrections",
);
assert.equal(
  whyOf({ turnIndex: 3, errorCounts: { "agreement:problema": 1 }, errorExamples: repeated.errorExamples }),
  "Not correcting out loud yet: Luci waits until a mistake repeats",
);
assert.equal(whyOf({ turnIndex: 3 }), WHY.talking);
assert.equal(whyOf({ turnIndex: 4, usedLemmas: ["huelga", "aprovechar", "casa"] }), WHY.talking);
for (let t = 0; t < 10; t++) {
  for (const over of [{}, repeated, { lastSpokenCorrectionTurn: 1, ...repeated }]) {
    const w = whyOf({ turnIndex: t, ...over });
    assert.ok(w.length > 0 && w.length <= 80, `why too long or empty: "${w}"`);
  }
}

// session round-trip
resetSessions();
const s = getSession("sess_check");
assert.equal(s.sessionId, "sess_check");
assert.equal(s.context.sessionId, "sess_check");
assert.deepEqual(s.policy.targetLemmas, ["huelga", "aprovechar", "casa"]);
assert.equal(s.policy.turnIndex, 0);
assert.equal(nextDirective(s.policy).isOpener, true);

recordCorrection("sess_check", errors, used);
recordCorrection("sess_check", errors, used);
assert.equal(getSession("sess_check"), s); // same object
assert.equal(s.policy.turnIndex, 2);
assert.deepEqual(s.policy.errorCounts, { "conjugation:tener": 2, "agreement:problema": 2 });
assert.deepEqual(s.policy.usedLemmas, ["huelga"]);
assert.deepEqual(s.policy.lastErrors, errors);
assert.equal(s.allErrors.length, 4);
assert.equal(nextDirective(s.policy).correction, "none"); // only 2 turns so far
assert.equal(nextDirective(s.policy).steerLemma, "aprovechar"); // huelga already used

recordCorrection("sess_check", [], []);
const d = nextDirective(s.policy); // turn 3: tie at 2 → first-seen key
assert.deepEqual(d.correction, {
  span: "yo tiene",
  correction: "yo tengo",
  reason: "With 'yo', 'tener' becomes 'tengo'.",
});
assert.deepEqual(s.policy.lastErrors, []);

noteSpokenCorrection("sess_check");
assert.equal(s.policy.lastSpokenCorrectionTurn, 3);
recordCorrection("sess_check", [], []);
assert.equal(nextDirective(s.policy).correction, "none"); // turn 4
recordCorrection("sess_check", [], []);
assert.equal(nextDirective(s.policy).correction, "none"); // turn 5
recordCorrection("sess_check", [], []);
assert.notEqual(nextDirective(s.policy).correction, "none"); // turn 6

// setSessionContext swaps the targets and keeps the counters
setSessionContext("sess_check", { ...s.context, targetWords: [{ lemma: "tren", english: "train", source: "due" }] });
assert.deepEqual(s.policy.targetLemmas, ["tren"]);
assert.equal(s.policy.turnIndex, 6);
assert.equal(nextDirective(s.policy).steerLemma, "tren");

// reset
resetSessions();
assert.equal(getSession("sess_check").policy.turnIndex, 0);
resetSessions();

console.log("ok");
