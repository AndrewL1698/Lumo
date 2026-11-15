import { SentenceTranslateRequest, SentenceTranslateResponse } from "@parrot/shared";
import { translateSentences } from "@/lib/claude";
import { checkExtensionToken } from "@/lib/auth";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const OPTIONS = preflight;

// Keyed by the exact English text. HACK: in-memory, saved to a file in the OS temp folder so a server restart
// doesn't make the next page load slow again (outside the repo, so nothing to commit). Open the demo page once
// before judging to warm it.
const CACHE_FILE = join(tmpdir(), "parrot-sentence-cache.json");
const cache = new Map<string, string | null>(loadCache());

function loadCache(): [string, string | null][] {
  try {
    return Object.entries(
      JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<string, string | null>,
    );
  } catch {
    return []; // no file yet, or unreadable: start empty
  }
}

function saveCache(): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache)));
  } catch (err) {
    console.warn("[api/translate-sentences] could not save cache", err);
  }
}

// D-018 immersion dial. No domain in the request, so no never-list check here (the extension enforces it).
export async function POST(req: Request) {
  const denied = checkExtensionToken(req);
  if (denied) return denied;
  const body = await parseBody(req, SentenceTranslateRequest);
  if (body instanceof NextResponse) return withCors(body);
  const { sentences } = body;

  const todo = [...new Set(sentences.filter((s) => !cache.has(s)))];
  if (todo.length) {
    try {
      const outs = await translateSentences(todo);
      // undefined = that group's call failed: leave it uncached so a reload retries it.
      todo.forEach((s, n) => {
        if (outs[n] !== undefined) cache.set(s, outs[n]);
      });
      saveCache();
    } catch (err) {
      // Degrade: uncached texts stay in English (not cached, so a reload retries).
      console.error("[api/translate-sentences] failed", err instanceof Error ? err.message : err);
    }
  }
  const cached = sentences.filter((s) => !todo.includes(s)).length;
  console.log(`[api/translate-sentences] ${sentences.length} texts, ${cached} cached`);

  return withCors(
    json({ items: sentences.map((s) => cache.get(s) ?? null) }, SentenceTranslateResponse),
  );
}
