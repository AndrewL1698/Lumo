import { visibleErrors } from "../../lib/tutor/highlight";
import type { CorrectionResult } from "../../lib/tutor/types";

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
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-green-800">
        ✓ No mistakes found in what you said.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {errors.map((e, i) => (
        <li key={i} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {TYPE_LABEL[e.type] ?? e.type}
            </span>
            <span className="text-red-700 line-through">{e.span}</span>
            <span aria-hidden>→</span>
            <span className="font-semibold text-green-700">{e.correction}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{e.explanation_en}</p>
        </li>
      ))}
    </ul>
  );
}
