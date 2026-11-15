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

// A turn the corrector flagged (D-011) gets a plain line instead of "No mistakes". Never a scolding tone.
function FlagLine({ result }: { result: CorrectionResult }) {
  if (result.flag === "english") {
    return (
      <div className="space-y-1">
        <p className="text-lg font-semibold text-wait">That was in English. Try it in Spanish{result.spanish_version ? ":" : "."}</p>
        {result.spanish_version && (
          <p lang="es" className="font-display text-lg font-semibold text-go">
            {result.spanish_version}
          </p>
        )}
      </div>
    );
  }
  if (result.flag === "unclear") {
    return <p className="text-lg font-semibold text-wait">We couldn&apos;t make that out. Try again in Spanish.</p>;
  }
  if (result.flag === "off_topic") {
    return <p className="text-lg font-semibold text-wait">That didn&apos;t quite answer the question.</p>;
  }
  return null;
}

// English explanations always visible (most judges don't speak Spanish).
export function CorrectionCards({ raw, result }: { raw: string; result?: CorrectionResult }) {
  if (!result) return null;
  const errors = visibleErrors(raw, result);
  // English and unclear turns carry no errors: the flag line replaces "No mistakes".
  if (result.flag === "english" || result.flag === "unclear") return <FlagLine result={result} />;
  if (errors.length === 0) {
    return result.flag === "off_topic" ? (
      <FlagLine result={result} />
    ) : (
      <p className="text-lg font-semibold text-go">No mistakes. Nicely said.</p>
    );
  }
  return (
    <div className="space-y-3">
    {result.flag === "off_topic" && <FlagLine result={result} />}
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
    </div>
  );
}
