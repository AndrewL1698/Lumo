import type { CorrectionResult } from "@parrot/shared";
import { segmentTranscript } from "./highlight";

// Renders the RAW transcript (what is graded), verbatim and in place. Each confident slip is struck in red
// with its correction set directly above it (interlinear, via <ruby>), so the fix reads without hovering.
export function TranscriptView({ raw, result }: { raw: string; result?: CorrectionResult }) {
  const segments = segmentTranscript(raw, result);
  return (
    // Normal leading; the browser grows only the lines that carry a correction above them.
    <p className="pt-3 text-2xl leading-[1.6] text-ink">
      {segments.map((seg, i) =>
        seg.error ? (
          <ruby key={i} className="fix mx-0.5">
            <s className="text-stop decoration-stop decoration-2">{seg.text}</s>
            <rt>{seg.error.correction}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}
