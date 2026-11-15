/**
 * Check for POST /api/tutor/end and lib/tutor/recap.ts. No network: the Anthropic key is removed and fetch is stubbed.
 * Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/recap.check.ts
 */
import assert from "node:assert/strict";
import { Recap, recapFixture, tutorContextFixture } from "@parrot/shared";
import type { CorrectionError } from "@parrot/shared";
import { POST } from "../../../app/api/tutor/end/route";
import { buildRecapLists, buildRecapUserMessage } from "../recap";
import { findSession, getSession, recordCorrection, resetSessions, setSessionContext } from "../session";

const post = async (sessionId: string) => {
  const res = await POST(
    new Request("http://localhost/api/tutor/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }),
  );
  assert.equal(res.status, 200);
  return Recap.parse(await res.json());
};

const err = (over: Partial<CorrectionError>): CorrectionError => ({
  span: "yo tiene",
  type: "conjugation",
  correction: "yo tengo",
  explanation_en: "yo form",
  severity: 2,
  confidence: 0.9,
  lemma: "tener",
  ...over,
});

async function main() {
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("network is disabled in recap.check.ts"));
  };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  resetSessions();
  const targets = tutorContextFixture.targetWords.map((w) => w.lemma);
  assert.ok(targets.length >= 2);

  // mock mode → fixture
  process.env.TUTOR_MOCK = "1";
  assert.deepEqual(await post("anything"), recapFixture);
  delete process.env.TUTOR_MOCK;

  // unknown session → empty recap, and no session is created
  let r = await post("nope");
  assert.deepEqual([r.topErrors, r.wordsNowKnown, r.reviewTomorrow, r.tips], [[], [], [], []]);
  assert.ok(r.summary_en.length > 0);
  assert.equal(findSession("nope"), undefined);

  // fixture context (DB down at session start): no word credit, but the recap still shows the session's mistakes
  setSessionContext("fx", { ...tutorContextFixture, sessionId: "fx" }, { credit: false });
  recordCorrection("fx", [err({})], []);
  r = await post("fx");
  assert.equal(r.topErrors.length, 1);
  assert.deepEqual(r.wordsNowKnown, []);

  // started by /context, nothing happened → no model call, review = all targets
  setSessionContext("clean", { ...tutorContextFixture, sessionId: "clean" });
  r = await post("clean");
  assert.deepEqual(r.topErrors, []);
  assert.deepEqual(r.reviewTomorrow, targets);
  assert.deepEqual(r.tips, []);
  assert.equal(fetchCalls, 0);

  // grouping, confidence filter, top 3, ties earliest-first, latest example wins
  setSessionContext("s", { ...tutorContextFixture, sessionId: "s" });
  recordCorrection("s", [err({ type: "word_choice", span: "a", lemma: "a" })], []); // count 1, seen first
  recordCorrection("s", [err({}), err({ type: "agreement", span: "la problema", lemma: "problema" })], []);
  recordCorrection("s", [err({ span: "Yo Tiene", correction: "Yo tengo" })], []); // tener ×2, latest example
  recordCorrection("s", [err({ type: "agreement", span: "la problema", lemma: "problema" })], []); // problema ×2
  recordCorrection("s", [err({ type: "word_choice", span: "b", lemma: "b" })], []); // count 1, seen later
  recordCorrection("s", [err({ type: "word_order", span: "z", lemma: "z", confidence: 0.6 })], []);
  recordCorrection("s", [err({ type: "word_order", span: "z", lemma: "z", confidence: 0.6 })], []);
  recordCorrection("s", [err({ type: "word_order", span: "z", lemma: "z", confidence: 0.6 })], []); // unshown ×3
  const s = getSession("s");
  s.creditedLemmas.push(targets[0]);
  const lists = buildRecapLists(s);
  assert.deepEqual(
    lists.topErrors.map((e) => [e.span, e.correction, e.count]),
    [
      ["Yo Tiene", "Yo tengo", 2],
      ["la problema", "yo tengo", 2],
      ["a", "yo tengo", 1],
    ],
  );
  assert.deepEqual(lists.wordsNowKnown, [targets[0]]);
  assert.deepEqual(lists.reviewTomorrow, targets.slice(1));
  const msg = buildRecapUserMessage(lists, "intermediate");
  for (const part of ["<level>intermediate</level>", "Yo Tiene", "×2", targets[0], targets[1]]) assert.ok(msg.includes(part), part);
  assert.ok(!msg.includes('"z"'));

  // model failure (no key, network off) → lists kept, fixed summary, tips []
  r = await post("s");
  assert.deepEqual(r.topErrors, lists.topErrors);
  assert.deepEqual(r.wordsNowKnown, [targets[0]]);
  assert.deepEqual(r.tips, []);
  assert.ok(r.summary_en.length > 0);

  resetSessions();
  console.log("ok");
}

main();
