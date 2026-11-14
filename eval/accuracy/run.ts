// Correction-accuracy eval (brief 4.1, specs §10). Posts each sentence to the running /api/tutor/correct
// (the real pipeline: span validation + confidence filter) and scores the flags against the planted errors.
//   npm run dev:web    (in another terminal)
//   npx tsx eval/accuracy/run.ts [--file eval/sentences.json] [--url http://localhost:3000]
// Writes eval/accuracy/results.json (raw responses + scores) for eval/README.md.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CorrectRequest, CorrectResponse, SpokenErrorType } from "@parrot/shared";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FILE = arg("--file", join(HERE, "..", "sentences.json"));
const URL = arg("--url", "http://localhost:3000");
const MIN_CONFIDENCE = 0.7; // what the UI shows (root CLAUDE.md); the route should already filter

// Format from eval/CLAUDE.md. Controls have null error fields.
const Sentence = z.object({
  id: z.string(),
  text: z.string(),
  error_span: z.string().nullable(),
  corrected_span: z.string().nullable(),
  error_type: SpokenErrorType.nullable(),
  is_control: z.boolean().optional(),
});
const sentences = z.array(Sentence).parse(JSON.parse(readFileSync(FILE, "utf8")));

// Normalise only for scoring, never in the data: lowercase, no accents, no punctuation, single spaces.
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
// "Overlaps" = the two spans share characters at their positions in the (normalised) sentence, so a flag with
// different boundaries ("agua es esencial" vs planted "que agua") still counts. Falls back to substring
// either way if a span can't be located in the sentence.
const overlaps = (flag: string, planted: string, sentence: string) => {
  const a = norm(flag), b = norm(planted), s = norm(sentence);
  if (!a || !b) return false;
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < 0) return a.includes(b) || b.includes(a);
  return i < j + b.length && j < i + a.length;
};

type Row = {
  id: string;
  control: boolean;
  type: string | null;
  planted: string | null;
  flags: { span: string; type: string; correction: string; confidence: number }[];
  caught: boolean;
  falseFlags: number;
  serverMs: number;
  roundTripMs: number;
  error?: string;
};

const rows: Row[] = [];
for (const s of sentences) {
  const control = s.is_control ?? s.error_span === null;
  const body = CorrectRequest.parse({ sessionId: randomUUID(), utteranceId: randomUUID(), rawText: s.text, sttPath: "typed" });
  const t0 = performance.now();
  try {
    const res = await fetch(`${URL}/api/tutor/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = CorrectResponse.parse(await res.json());
    const roundTripMs = performance.now() - t0;
    const flags = out.correction.errors
      .filter((e) => e.confidence >= MIN_CONFIDENCE)
      .map((e) => ({ span: e.span, type: e.type, correction: e.correction, confidence: e.confidence }));
    const hits = flags.filter((f) => !control && s.error_span !== null && overlaps(f.span, s.error_span, s.text));
    rows.push({
      id: s.id,
      control,
      type: s.error_type,
      planted: s.error_span,
      flags,
      caught: hits.length > 0,
      falseFlags: flags.length - hits.length,
      serverMs: out.serverMs,
      roundTripMs,
    });
  } catch (err) {
    rows.push({ id: s.id, control, type: s.error_type, planted: s.error_span, flags: [], caught: false, falseFlags: 0, serverMs: NaN, roundTripMs: NaN, error: String(err) });
  }
  process.stdout.write(rows.at(-1)!.error ? "x" : ".");
}
process.stdout.write("\n");

// ---- Scores ----
const ok = rows.filter((r) => !r.error);
const planted = ok.filter((r) => !r.control);
const controls = ok.filter((r) => r.control);
const caught = planted.filter((r) => r.caught).length;
const allFlags = ok.reduce((n, r) => n + r.flags.length, 0);
const trueFlags = ok.reduce((n, r) => n + (r.flags.length - r.falseFlags), 0);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}% (${a}/${b})` : "n/a");
const quantile = (xs: number[], q: number) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};

const scores = {
  file: FILE,
  url: URL,
  ranAt: new Date().toISOString(),
  sentences: rows.length,
  failedRequests: rows.length - ok.length,
  recall: pct(caught, planted.length),
  precision: pct(trueFlags, allFlags),
  falseAlarmRate: pct(controls.filter((r) => r.flags.length > 0).length, controls.length),
  serverMs: { median: quantile(ok.map((r) => r.serverMs), 0.5), p90: quantile(ok.map((r) => r.serverMs), 0.9) },
  roundTripMs: {
    median: Math.round(quantile(ok.map((r) => r.roundTripMs), 0.5)),
    p90: Math.round(quantile(ok.map((r) => r.roundTripMs), 0.9)),
  },
  byType: Object.fromEntries(
    SpokenErrorType.options.map((t) => {
      const ofType = planted.filter((r) => r.type === t);
      return [t, { planted: ofType.length, caught: ofType.filter((r) => r.caught).length }];
    }),
  ),
};

console.log(`\nCorrection accuracy: ${rows.length} sentences from ${FILE}`);
if (scores.failedRequests) console.log(`!! ${scores.failedRequests} requests failed (excluded): ${rows.find((r) => r.error)?.error}`);
console.log(`Recall           ${scores.recall}`);
console.log(`Precision        ${scores.precision}`);
console.log(`False-alarm rate ${scores.falseAlarmRate}   (clean controls with ≥1 flag)`);
console.log(`serverMs         median ${scores.serverMs.median}  p90 ${scores.serverMs.p90}`);
console.log(`round trip ms    median ${scores.roundTripMs.median}  p90 ${scores.roundTripMs.p90}`);
console.log("\nBy error type     planted  caught");
for (const [t, v] of Object.entries(scores.byType)) if (v.planted) console.log(`  ${t.padEnd(16)} ${String(v.planted).padStart(6)}  ${String(v.caught).padStart(6)}`);

const misses = planted.filter((r) => !r.caught).map((r) => `${r.id} (${r.type}: "${r.planted}")`);
if (misses.length) console.log(`\nMissed: ${misses.join(", ")}`);

const out = join(HERE, "results.json");
writeFileSync(out, JSON.stringify({ scores, rows }, null, 2) + "\n");
console.log(`\nWrote ${out}`);
