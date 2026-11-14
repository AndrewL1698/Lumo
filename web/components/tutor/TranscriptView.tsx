import type { CorrectionResult } from "@parrot/shared";
import { segmentTranscript } from "./highlight";

// Renders the RAW transcript (what is graded) with confident errors highlighted inline.
// Shows the fix right after each span so it is readable without hovering (judges).
export function TranscriptView({ raw, result }: { raw: string; result?: CorrectionResult }) {
  const segments = segmentTranscript(raw, result);
  return (
    <p className="text-xl leading-relaxed text-slate-900">
      {segments.map((seg, i) =>
        seg.error ? (
          <span key={i} className="mx-0.5 inline-flex items-baseline gap-1.5">
            <mark className="rounded bg-red-100 px-1 text-red-800 line-through decoration-red-400">
              {seg.text}
            </mark>
            <span className="rounded bg-green-100 px-1 font-semibold text-green-800">
              {seg.error.correction}
            </span>
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}
