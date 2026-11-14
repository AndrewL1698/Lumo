import type { CorrectionError, CorrectionResult } from "./types";

export const MIN_CONFIDENCE = 0.7;

export interface Segment {
  text: string;
  error?: CorrectionError; // present => highlighted span
}

/**
 * Split the RAW transcript into plain and highlighted segments.
 * - drops errors below MIN_CONFIDENCE
 * - drops errors whose span is not a verbatim substring (no-auto-correct rule)
 * - each error claims the first occurrence not already claimed/overlapped
 * - overlapping errors: the earlier-claimed one wins, the other is skipped
 * Never throws; worst case returns one plain segment.
 */
export function segmentTranscript(raw: string, result?: CorrectionResult): Segment[] {
  if (!result || !raw) return [{ text: raw }];

  const claimed: { start: number; end: number; error: CorrectionError }[] = [];
  const overlaps = (s: number, e: number) => claimed.some((c) => s < c.end && e > c.start);

  for (const error of result.errors) {
    if (error.confidence < MIN_CONFIDENCE || !error.span) continue;
    let from = 0;
    let found = -1;
    while (from <= raw.length) {
      const i = raw.indexOf(error.span, from);
      if (i === -1) break;
      if (!overlaps(i, i + error.span.length)) {
        found = i;
        break;
      }
      from = i + 1;
    }
    if (found !== -1) claimed.push({ start: found, end: found + error.span.length, error });
  }

  claimed.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const c of claimed) {
    if (c.start > cursor) out.push({ text: raw.slice(cursor, c.start) });
    out.push({ text: raw.slice(c.start, c.end), error: c.error });
    cursor = c.end;
  }
  if (cursor < raw.length) out.push({ text: raw.slice(cursor) });
  return out.length ? out : [{ text: raw }];
}

/** Errors that will actually be shown (for the explanation list under the transcript). */
export function visibleErrors(raw: string, result?: CorrectionResult): CorrectionError[] {
  return segmentTranscript(raw, result).flatMap((s) => (s.error ? [s.error] : []));
}
