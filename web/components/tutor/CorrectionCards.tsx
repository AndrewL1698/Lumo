import type { CorrectionResult } from "@parrot/shared";
import { visibleErrors } from "./highlight";

const TYPE_LABEL: Record<string, string> = {
  conjugation: "Verb form",
  agreement: "Agreement",
  word_choice: "Word choice",
  word_order: "Word order",
  missing_word: "Missing word",
  extra_word: "Extra word",
};

// English explanations always visible (most judges don't speak Spanish).
export function CorrectionCards({ raw, result }: { raw: string; result?: CorrectionResult }) {
  if (!result) return null;
  const errors = visibleErrors(raw, result);
  if (errors.length === 0) {
    return <p className="text-lg font-semibold text-go">No mistakes. Nicely said.</p>;
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {errors.map((e, i) => (
        <li key={i} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <span className="text-sm text-muted sm:pt-1">{TYPE_LABEL[e.type] ?? e.type}</span>
          <div>
            <p className="text-lg">
              <s className="text-stop decoration-stop">{e.span}</s>
              <span className="mx-2 text-muted" aria-label="corrected to">
                →
              </span>
              <span className="font-bold text-go">{e.correction}</span>
            </p>
            <p className="mt-1 text-muted">{e.explanation_en}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
