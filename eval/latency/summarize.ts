/**
 * Latency summary for the pitch (specs §10): reads the TurnTimeline lines that
 * POST /api/tutor/metrics appends to eval/latency/turns.jsonl.
 *
 * Usage (repo root):  npx tsx eval/latency/summarize.ts [--file path]
 *
 * Median = middle value (mean of the two middle values for an even count); p90 = nearest rank.
 * Headline numbers are voiced turns (realtime + batch). Typed turns have tPress = tRelease =
 * tSttFinal, so they are reported separately.
 */
import { TurnTimeline } from "@parrot/shared";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TARGETS = { correctionMs: 1500, audioMs: 2000 };

const METRICS = [
  ["sttFinal", "release -> STT final", "tSttFinal"],
  ["correction", "release -> correction", "tCorrectionShown"],
  ["replyFirstToken", "release -> reply first token", "tReplyFirstToken"],
  ["firstChunk", "release -> first chunk", "tFirstChunk"],
  ["audioStart", "release -> audio start", "tAudioStart"],
] as const;
export type MetricKey = (typeof METRICS)[number][0];

export type Stat = { n: number; median: number | null; p90: number | null };
export type GroupStats = Record<MetricKey, Stat>;
export type Summary = {
  turns: number;
  byPath: Record<TurnTimeline["sttPath"], number>;
  voiced: GroupStats;
  typed: GroupStats;
  /** `pass` is null when there are no voiced turns with that value. */
  targets: {
    correction: { median: number | null; targetMs: number; pass: boolean | null };
    audio: { median: number | null; targetMs: number; pass: boolean | null };
  };
};

export function stat(values: number[]): Stat {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return { n, median: null, p90: null };
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { n, median, p90: s[Math.ceil(0.9 * n) - 1] };
}

function group(turns: TurnTimeline[]): GroupStats {
  const out = {} as GroupStats;
  for (const [key, , field] of METRICS) {
    const deltas: number[] = [];
    for (const t of turns) {
      const v = t[field];
      if (v !== null) deltas.push(v - t.tRelease);
    }
    out[key] = stat(deltas);
  }
  return out;
}

export function summarize(timelines: TurnTimeline[]): Summary {
  const byPath = { realtime: 0, batch: 0, typed: 0 };
  for (const t of timelines) byPath[t.sttPath]++;
  const voiced = group(timelines.filter((t) => t.sttPath !== "typed"));
  const typed = group(timelines.filter((t) => t.sttPath === "typed"));
  const target = (median: number | null, targetMs: number) => ({
    median,
    targetMs,
    pass: median === null ? null : median <= targetMs,
  });
  return {
    turns: timelines.length,
    byPath,
    voiced,
    typed,
    targets: {
      correction: target(voiced.correction.median, TARGETS.correctionMs),
      audio: target(voiced.audioStart.median, TARGETS.audioMs),
    },
  };
}

/** Parse jsonl text: blank and bad lines are skipped and counted. */
export function parseJsonl(text: string): { timelines: TurnTimeline[]; skipped: number } {
  const timelines: TurnTimeline[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      skipped++;
      continue;
    }
    try {
      const parsed = TurnTimeline.safeParse(JSON.parse(line));
      if (parsed.success) timelines.push(parsed.data);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { timelines, skipped };
}

const ms = (v: number | null) => (v === null ? "-" : `${Math.round(v)} ms`);

export function format(s: Summary): string {
  const lines: string[] = [];
  const voicedN = s.byPath.realtime + s.byPath.batch;
  lines.push(
    `turns: ${s.turns}  (realtime ${s.byPath.realtime}, batch ${s.byPath.batch}, typed ${s.byPath.typed})`,
  );
  const table = (title: string, g: GroupStats) => {
    lines.push("", title);
    lines.push(`  ${"metric".padEnd(30)}${"n".padStart(4)}${"median".padStart(11)}${"p90".padStart(11)}`);
    for (const [key, label] of METRICS) {
      const st = g[key];
      lines.push(
        `  ${label.padEnd(30)}${String(st.n).padStart(4)}${ms(st.median).padStart(11)}${ms(st.p90).padStart(11)}`,
      );
    }
  };
  table(`voiced (realtime + batch), ${voicedN} turns`, s.voiced);
  if (s.byPath.typed > 0) table(`typed, ${s.byPath.typed} turns (release = STT final)`, s.typed);
  lines.push("");
  const verdict = (label: string, t: Summary["targets"]["audio"]) =>
    lines.push(
      `${t.pass === null ? "NO DATA" : t.pass ? "PASS" : "FAIL"}  median ${label} ${ms(t.median)} (target <= ${t.targetMs} ms, voiced)`,
    );
  verdict("release -> correction", s.targets.correction);
  verdict("release -> audio start", s.targets.audio);
  return lines.join("\n");
}

function main() {
  const i = process.argv.indexOf("--file");
  const file = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : path.join(import.meta.dirname, "turns.jsonl");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    console.error(`No turns file at ${file}. Run a tutor session first, or pass --file <path>.`);
    process.exit(1);
  }
  // The trailing newline of the last line is not a "blank line".
  const { timelines, skipped } = parseJsonl(text.replace(/\n$/, ""));
  console.log(`file: ${file}`);
  if (skipped > 0) console.log(`skipped ${skipped} blank/bad line(s)`);
  console.log(format(summarize(timelines)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
