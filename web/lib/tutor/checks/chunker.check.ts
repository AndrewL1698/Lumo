/** Run: npx tsx web/lib/tutor/checks/chunker.check.ts */
import assert from "node:assert/strict";
import { replyTextFixture, TurnTimeline } from "@parrot/shared";
import { createChunker } from "../chunker";
import { createTimeline } from "../client/timeline";

function run(deltas: string[]): string[] {
  const c = createChunker();
  const out: string[] = [];
  for (const d of deltas) out.push(...c.push(d));
  out.push(...c.flush());
  for (const chunk of out) {
    assert.ok(chunk.length > 0 && chunk === chunk.trim(), "chunks are trimmed and non-empty");
    assert.ok(chunk.length <= 500, "chunks fit TtsRequest");
  }
  return out;
}
const byWord = (t: string) => t.split(/(?<=\s)/);
const byChar = (t: string) => t.split("");
/** Same chunks however the text is sliced; returns them. */
function all(text: string): string[] {
  const whole = run([text]);
  assert.deepEqual(run(byWord(text)), whole);
  assert.deepEqual(run(byChar(text)), whole);
  assert.deepEqual(run(text.match(/[\s\S]{1,7}/g) ?? []), whole);
  assert.equal(
    whole.join(" "),
    text.trim().replace(/\s+/g, " "),
    "no text lost, duplicated or reordered",
  );
  return whole;
}

// The fixture: "Claro," is under 25 chars, so no comma split; later commas never split.
assert.deepEqual(all(replyTextFixture), [
  "Claro, entiendo.",
  "El problema es que la huelga sigue, ¿verdad?",
  "¿Cómo llegas al trabajo esta semana?",
]);

// Long first sentence: splits at the first comma at or past 25 chars. Later sentences don't.
assert.deepEqual(
  all(
    "Bueno, la verdad es que no lo sé, pero creo que mañana sigue. Si quieres ir al centro mañana, toma el autobús.",
  ),
  [
    "Bueno, la verdad es que no lo sé,",
    "pero creo que mañana sigue.",
    "Si quieres ir al centro mañana, toma el autobús.",
  ],
);

// No comma split inside an open ¿…? even in the first chunk.
assert.deepEqual(all("¿Y entonces qué piensas de la huelga, amigo? Dime."), [
  "¿Y entonces qué piensas de la huelga, amigo?",
  "Dime.",
]);

// Terminator runs, closing quotes, ellipsis, decimals, extra whitespace.
assert.deepEqual(all('¿¡Qué!? Dijo "vale." Pues... cuesta 3.5 euros…  \n ¡Hasta luego!'), [
  "¿¡Qué!?",
  'Dijo "vale."',
  "Pues...",
  "cuesta 3.5 euros…",
  "¡Hasta luego!",
]);
assert.deepEqual(run(["", "  ", "\n"]), []);

// First chunk only: a sentence ending exactly at a delta boundary goes out without waiting for the next delta.
const early = createChunker();
assert.deepEqual(early.push("¡Qué bien!"), ["¡Qué bien!"]);
assert.deepEqual(early.push(" ¿Y tú?"), []); // later chunks still wait for the next character
assert.deepEqual(early.flush(), ["¿Y tú?"]);
// ...but never after a digit, or inside an open ¿/¡.
assert.deepEqual(run(["Cuesta 3.", "5 euros."]), ["Cuesta 3.5 euros."]);
assert.deepEqual(run(["¿¡Qué!", "? Dijo"]), ["¿¡Qué!?", "Dijo"]);
// An early "Bueno." leaves ".." behind: punctuation-only pieces are not spoken.
assert.deepEqual(run(["Bueno.", "..", " Pues sí."]), ["Bueno.", "Pues sí."]);

// 600 chars with no terminator: split at whitespace, every chunk under 500.
const long =
  Array.from({ length: 100 }, () => "hola").join(" ") +
  " fin de la frase tan larga y sin punto final que no se acaba nunca jamas de los jamases ok"; // HACK: padded by hand
const longText = long.padEnd(600, "a");
assert.equal(longText.length, 600);
const longChunks = all(longText);
assert.ok(longChunks.length >= 2);
assert.ok(longChunks.every((c) => c.length <= 480));
// One giant word: hard cut, nothing lost.
assert.deepEqual(
  run(byChar("x".repeat(600))).map((c) => c.length),
  [480, 120],
);

// Timeline.
let t = 0;
const tl = createTimeline("s1", "u1", () => (t += 10));
assert.equal(tl.toTimeline(), null);
tl.mark("tPress");
tl.mark("tRelease");
tl.mark("tPress"); // first mark wins (and the clock is not read again)
tl.mark("tAudioStart");
assert.equal(tl.toTimeline(), null);
tl.mark("tSttFinal");
const parsed = TurnTimeline.parse(tl.toTimeline());
assert.deepEqual(parsed, {
  sessionId: "s1",
  utteranceId: "u1",
  sttPath: "realtime",
  tPress: 10,
  tRelease: 20,
  tSttFinal: 40,
  tCorrectionShown: null,
  tReplyFirstToken: null,
  tFirstChunk: null,
  tTtsFirstBytes: null,
  tAudioStart: 30,
});
tl.setSttPath("batch");
assert.equal(tl.toTimeline()?.sttPath, "batch");
assert.equal(typeof createTimeline("s", "u").toTimeline, "function"); // default clock constructs

console.log("ok");
