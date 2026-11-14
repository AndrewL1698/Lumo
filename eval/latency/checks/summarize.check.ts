/** Run: npx tsx --tsconfig web/tsconfig.json eval/latency/checks/summarize.check.ts  (no network; writes only to os.tmpdir()) */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TurnTimeline } from "@parrot/shared";
import { POST } from "../../../web/app/api/tutor/metrics/route";
import { format, parseJsonl, stat, summarize } from "../summarize";

const turn = (
  id: string,
  sttPath: TurnTimeline["sttPath"],
  tRelease: number,
  tSttFinal: number,
  tCorrectionShown: number | null,
  tReplyFirstToken: number | null,
  tFirstChunk: number | null,
  tAudioStart: number | null,
): TurnTimeline => ({
  sessionId: "s1",
  utteranceId: id,
  sttPath,
  tPress: sttPath === "typed" ? tRelease : tRelease - 2000,
  tRelease,
  tSttFinal,
  tCorrectionShown,
  tReplyFirstToken,
  tFirstChunk,
  tTtsFirstBytes: null,
  tAudioStart,
});

// Deltas from release:      stt   corr   reply  chunk  audio
const TURNS = [
  turn("a", "realtime", 1000, 1200, 2000, 1500, 1700, 2600), // 200  1000   500    700   1600
  turn("b", "realtime", 2000, 2300, 3400, 2600, 2900, 3800), // 300  1400   600    900   1800
  turn("c", "batch", 500, 1400, 2500, null, null, null), //     900  2000    -      -      -
  turn("d", "batch", 0, 400, null, 800, 1000, 2400), //         400    -    800   1000   2400
  turn("e", "typed", 100, 100, 700, 400, 500, 1000), //           0   600   300    400    900
];

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/tutor/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

async function main() {
  // ---------- stat: median + nearest-rank p90 ----------
  assert.deepEqual(stat([]), { n: 0, median: null, p90: null });
  assert.deepEqual(stat([7]), { n: 1, median: 7, p90: 7 });
  assert.deepEqual(stat([10, 1, 9, 2, 8, 3, 7, 4, 6, 5]), { n: 10, median: 5.5, p90: 9 }); // rank ceil(9) = 9
  assert.deepEqual(stat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), { n: 11, median: 6, p90: 10 }); // rank ceil(9.9) = 10

  // ---------- summarize ----------
  const s = summarize(TURNS);
  assert.equal(s.turns, 5);
  assert.deepEqual(s.byPath, { realtime: 2, batch: 2, typed: 1 });
  assert.deepEqual(s.voiced.sttFinal, { n: 4, median: 350, p90: 900 }); // even count: (300 + 400) / 2
  assert.deepEqual(s.voiced.correction, { n: 3, median: 1400, p90: 2000 }); // d's null skipped
  assert.deepEqual(s.voiced.replyFirstToken, { n: 3, median: 600, p90: 800 });
  assert.deepEqual(s.voiced.firstChunk, { n: 3, median: 900, p90: 1000 });
  assert.deepEqual(s.voiced.audioStart, { n: 3, median: 1800, p90: 2400 });
  // The typed turn is kept out of the voiced numbers.
  assert.deepEqual(s.typed.sttFinal, { n: 1, median: 0, p90: 0 });
  assert.deepEqual(s.typed.correction, { n: 1, median: 600, p90: 600 });
  assert.deepEqual(s.typed.audioStart, { n: 1, median: 900, p90: 900 });
  assert.deepEqual(s.targets.correction, { median: 1400, targetMs: 1500, pass: true });
  assert.deepEqual(s.targets.audio, { median: 1800, targetMs: 2000, pass: true });

  const out = format(s);
  assert.match(out, /turns: 5 {2}\(realtime 2, batch 2, typed 1\)/);
  assert.match(out, /PASS {2}median release -> correction 1400 ms/);
  assert.match(out, /PASS {2}median release -> audio start 1800 ms/);

  // Slow turns fail; the boundary passes; no voiced data is neither.
  const slow = summarize([turn("x", "realtime", 0, 100, 1501, 500, 600, 2001)]);
  assert.equal(slow.targets.correction.pass, false);
  assert.equal(slow.targets.audio.pass, false);
  assert.match(format(slow), /FAIL {2}median release -> audio start 2001 ms/);
  const edge = summarize([turn("x", "batch", 0, 100, 1500, 500, 600, 2000)]);
  assert.equal(edge.targets.correction.pass, true);
  assert.equal(edge.targets.audio.pass, true);
  const typedOnly = summarize([TURNS[4]]);
  assert.equal(typedOnly.targets.audio.pass, null);
  assert.equal(typedOnly.voiced.audioStart.n, 0);
  assert.match(format(typedOnly), /NO DATA/);
  assert.equal(summarize([]).turns, 0);

  // ---------- parseJsonl: blank and bad lines are skipped and counted ----------
  const parsed = parseJsonl(
    [JSON.stringify(TURNS[0]), "", "not json", JSON.stringify({ sessionId: "s1" }), JSON.stringify(TURNS[2])].join("\n"),
  );
  assert.equal(parsed.timelines.length, 2);
  assert.equal(parsed.skipped, 3);

  // ---------- POST /api/tutor/metrics ----------
  const dir = mkdtempSync(path.join(os.tmpdir(), "parrot-metrics-"));
  const file = path.join(dir, "nested", "turns.jsonl"); // the directory is created on demand
  const prevEnv = process.env.PARROT_TURNS_FILE;
  const realError = console.error;
  try {
    process.env.PARROT_TURNS_FILE = file;

    for (const t of [TURNS[0], TURNS[4]]) {
      const res = await post(t);
      assert.equal(res.status, 204);
      assert.equal(await res.text(), "");
    }
    const lines = readFileSync(file, "utf8").split("\n");
    assert.equal(lines.pop(), ""); // trailing newline
    assert.equal(lines.length, 2);
    const rows = lines.map((l) => JSON.parse(l) as TurnTimeline & { at: string });
    assert.deepEqual(TurnTimeline.parse(rows[0]), TURNS[0]);
    assert.deepEqual(TurnTimeline.parse(rows[1]), TURNS[4]);
    for (const r of rows) assert.equal(new Date(r.at).toISOString(), r.at);
    assert.equal(parseJsonl(lines.join("\n")).timelines.length, 2); // summarize can read what the route wrote

    // Invalid bodies: 400, nothing appended.
    const before = readFileSync(file, "utf8");
    assert.equal((await post({ ...TURNS[0], sttPath: "telepathy" })).status, 400);
    assert.equal((await post({ sessionId: "s1" })).status, 400);
    assert.equal((await post("{not json")).status, 400);
    assert.equal(readFileSync(file, "utf8"), before);

    // Unwritable path (parent is a regular file): still 204, one console.error line, no throw.
    const blocker = path.join(dir, "blocker");
    writeFileSync(blocker, "x");
    process.env.PARROT_TURNS_FILE = path.join(blocker, "turns.jsonl");
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => void errors.push(args);
    const res = await post(TURNS[1]);
    console.error = realError;
    assert.equal(res.status, 204);
    assert.equal(errors.length, 1);
    assert.equal(readFileSync(file, "utf8"), before);
  } finally {
    console.error = realError;
    if (prevEnv === undefined) delete process.env.PARROT_TURNS_FILE;
    else process.env.PARROT_TURNS_FILE = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(existsSync(dir), false);

  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
