/**
 * Check for POST /api/tutor/correct. No network: the Anthropic key is removed and fetch is stubbed to throw.
 * Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/correct.check.ts
 */
import assert from "node:assert/strict";
import { CorrectResponse } from "@parrot/shared";
import { POST } from "../../../app/api/tutor/correct/route";
import { getSession, resetSessions } from "../session";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/tutor/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const request = (utteranceId: string) => ({
  sessionId: "check_session",
  utteranceId,
  rawText: " yo tiene la problema ", // spaces on purpose: the raw text is never trimmed
  tutorPrevious: "¿Qué pasó hoy?",
  sttPath: "typed",
});

async function main() {
  // Safety net: nothing in this check may reach the network.
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("network is disabled in correct.check.ts"));
  };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  resetSessions();

  // (a) mock mode: fixture body, utterance_id from the request, one turn recorded
  process.env.TUTOR_MOCK = "1";
  let res = await post(request("utt_a"));
  assert.equal(res.status, 200);
  let body = CorrectResponse.parse(await res.json());
  assert.equal(body.correction.utterance_id, "utt_a");
  assert.ok(body.correction.errors.length > 0);
  assert.equal(res.headers.get("X-Correction-Failed"), null);
  assert.equal(getSession("check_session").policy.turnIndex, 1);

  // (b) real path with no key: fails locally, degrades to an empty correction, still records the turn
  delete process.env.TUTOR_MOCK;
  const before = getSession("check_session").policy.turnIndex;
  const t0 = Date.now();
  res = await post(request("utt_b"));
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Correction-Failed"), "1");
  body = CorrectResponse.parse(await res.json());
  assert.equal(body.correction.utterance_id, "utt_b");
  assert.deepEqual(body.correction.errors, []);
  assert.deepEqual(body.correction.target_words_used, []);
  assert.equal(body.correction.overall_ok, true);
  assert.deepEqual(body.wordUpdates, []);
  assert.equal(getSession("check_session").policy.turnIndex, before + 1);
  assert.ok(elapsed < 6000, `failure path took ${elapsed}ms`);

  // (c) invalid bodies: 400, and no turn recorded
  res = await post({ sessionId: "check_session", utteranceId: "utt_c", rawText: "", sttPath: "typed" });
  assert.equal(res.status, 400);
  res = await post("not json");
  assert.equal(res.status, 400);
  assert.equal(getSession("check_session").policy.turnIndex, before + 1);

  console.log(`ok (failure path ${elapsed}ms, fetch calls ${fetchCalls})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
