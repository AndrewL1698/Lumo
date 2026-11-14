/**
 * Check for creditTargetWords (task 12). Offline: the learner-model write is a fake, fetch is stubbed to reject.
 * Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/targetWords.check.ts
 */
import assert from "node:assert/strict";
import { tutorContextFixture } from "@parrot/shared";
import type { CorrectionError, TargetWordUse, TutorContext } from "@parrot/shared";
import { getSession, resetSessions, setSessionContext } from "../session";
import { creditTargetWords, type RecordFn } from "../targetWords";

const ctx = (sessionId: string): TutorContext => ({
  ...tutorContextFixture,
  sessionId,
  targetWords: [
    { lemma: "empresa", article: "la", english: "company", source: "hovered" },
    { lemma: "mercado", article: "el", english: "market", source: "due" },
    { lemma: "casa", article: "la", english: "house", source: "due" },
  ],
});

let calls: { lemma: string; type: string }[] = [];
const fake: RecordFn = async (_userId, lemma, type) => {
  calls.push({ lemma, type });
  return type === "spoken_correct" ? { from: "learning", to: "known" } : { from: "learning", to: "learning" };
};
const use = (lemma: string, form: string, correct = true): TargetWordUse => ({ lemma, form, correct });

const credit = (sessionId: string, rawText: string, used: TargetWordUse[], over: Partial<Parameters<typeof creditTargetWords>[0]> = {}) =>
  creditTargetWords({ sessionId, userId: "u1", rawText, kept: [], used, record: fake, ...over });

async function main() {
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("network is disabled in targetWords.check.ts"));
  };
  resetSessions();
  const session = (id: string) => {
    setSessionContext(id, ctx(id));
    return getSession(id);
  };

  // Credited once with a full sentence of the learner's own.
  const s1 = session("s1");
  const said = "Creo que la empresa tiene un problema muy grande ahora";
  const tutorPrevious = "¿Qué opinas de la noticia de hoy?";
  let out = await credit("s1", said, [use("empresa", "empresa")], { tutorPrevious });
  assert.deepEqual(out, [{ lemma: "empresa", from: "learning", to: "known" }]);
  assert.deepEqual(calls, [{ lemma: "empresa", type: "spoken_correct" }]);
  assert.deepEqual(s1.creditedLemmas, ["empresa"]);

  // Same again in that session: already credited, no write.
  out = await credit("s1", said, [use("empresa", "empresa")], { tutorPrevious });
  assert.deepEqual(out, []);
  assert.equal(calls.length, 1);

  // Echo: the learner repeats the tutor's line word for word.
  calls = [];
  const s2 = session("s2");
  const line = "¿Y qué piensas tú de la empresa y su nuevo jefe?";
  out = await credit("s2", line, [use("empresa", "empresa")], { tutorPrevious: line });
  assert.deepEqual(out, []);
  assert.equal(calls.length, 0);
  // Short echo ("under 4 words" and/or echo rule).
  out = await credit("s2", "Sí, la empresa", [use("empresa", "empresa")], { tutorPrevious: line });
  assert.deepEqual(out, []);
  assert.equal(calls.length, 0);
  assert.deepEqual(s2.creditedLemmas, []);

  // Model returned "la casa" as the lemma: still credits the session's "casa".
  out = await credit("s2", "Mi casa es muy grande y bonita", [use("la casa", "casa")]);
  assert.deepEqual(out, [{ lemma: "casa", from: "learning", to: "known" }]);
  assert.deepEqual(calls, [{ lemma: "casa", type: "spoken_correct" }]);
  assert.deepEqual(s2.creditedLemmas, ["casa"]);

  // A confident error on the word: spoken_incorrect is written, but from === to so no WordUpdate.
  calls = [];
  const s3 = session("s3");
  const wrong = "Creo que el empresa tiene un problema grande";
  const kept: CorrectionError[] = [
    {
      span: "el empresa",
      type: "agreement",
      correction: "la empresa",
      explanation_en: "Empresa is feminine.",
      severity: 2,
      confidence: 0.9,
      lemma: "empresa",
    },
  ];
  out = await credit("s3", wrong, [use("empresa", "empresa", false)], { kept });
  assert.deepEqual(out, []);
  assert.deepEqual(calls, [{ lemma: "empresa", type: "spoken_incorrect" }]);
  assert.deepEqual(s3.creditedLemmas, []);

  // record throws: no update, not credited, no throw.
  const s4 = session("s4");
  out = await credit("s4", said, [use("empresa", "empresa")], {
    record: async () => {
      throw new Error("db down\nsecond line");
    },
  });
  assert.deepEqual(out, []);
  assert.deepEqual(s4.creditedLemmas, []);

  // record never resolves: times out, no update, not credited.
  const t0 = Date.now();
  out = await credit("s4", said, [use("empresa", "empresa")], { record: () => new Promise(() => {}), timeoutMs: 50 });
  const elapsed = Date.now() - t0;
  assert.deepEqual(out, []);
  assert.ok(elapsed < 1000, `timeout took ${elapsed}ms`);
  assert.deepEqual(s4.creditedLemmas, []);

  assert.equal(fetchCalls, 0);
  console.log(`ok (timeout path ${elapsed}ms)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
