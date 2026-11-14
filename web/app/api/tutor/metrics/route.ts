import { TurnTimeline } from "@parrot/shared";
import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
// Relative (not "@/") so eval/latency/checks can import this route under `tsc -p eval`.
import { parseBody } from "../../../../lib/http";

/** `<repo>/eval/latency/turns.jsonl`, whether cwd is the repo root (tsx) or `web/` (Next). */
function turnsFile(): string {
  if (process.env.PARROT_TURNS_FILE) return process.env.PARROT_TURNS_FILE;
  const cwd = process.cwd();
  const repo =
    !existsSync(path.join(cwd, "web", "package.json")) && path.basename(cwd) === "web"
      ? path.dirname(cwd)
      : cwd;
  return path.join(repo, "eval", "latency", "turns.jsonl");
}

/** Append one TurnTimeline (+ `at`) per line. Summarize with `npx tsx eval/latency/summarize.ts`. */
export async function POST(req: Request) {
  const body = await parseBody(req, TurnTimeline);
  if (body instanceof NextResponse) return body;
  try {
    const file = turnsFile();
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify({ ...body, at: new Date().toISOString() }) + "\n");
  } catch (err) {
    // Metrics must never break a turn.
    console.error("metrics: could not append turn timeline:", err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 204 });
}
