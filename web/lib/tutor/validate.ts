/**
 * Server checks after the corrector model (voice-plan §1.6, §5a). Pure functions, no I/O.
 * The raw transcript and the spans are never modified here.
 */
import type { CorrectionError, TargetWord, TargetWordUse } from "@parrot/shared";
import { TUTOR } from "../config";
import type { ModelCorrection, TargetWordVerdict, ValidatedCorrection, ValidateTargetWordsArgs } from "./types";

/** Lowercase, strip accents (ñ stays ñ), strip punctuation, collapse whitespace. For comparing only. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/(?<!n)̃|[̀-̂̄-ͯ]/g, "") // keep the tilde on n: ñ is a letter
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : n > 1 ? 1 : 0);

function toSeverity(n: number): 1 | 2 | 3 {
  if (Number.isNaN(n)) return 2;
  const r = Math.round(n);
  return r <= 1 ? 1 : r >= 3 ? 3 : 2;
}

export function validateCorrection(rawText: string, model: ModelCorrection): ValidatedCorrection {
  const kept: CorrectionError[] = [];
  for (const e of model.errors ?? []) {
    if (typeof e.span !== "string" || e.span.length === 0 || !rawText.includes(e.span)) continue;
    const correction = e.correction ?? "";
    if (normalize(e.span) === normalize(correction)) continue; // accent/punctuation/case only
    const confidence = clamp01(e.confidence);
    if (confidence < TUTOR.keepConfidence) continue;
    kept.push({
      span: e.span,
      type: e.type,
      correction,
      explanation_en: e.explanation_en ?? "",
      severity: toSeverity(e.severity),
      confidence,
      lemma: e.lemma ?? null,
    });
  }
  const shown = kept.filter((e) => e.confidence >= TUTOR.showConfidence);
  const target_words_used: TargetWordUse[] = (model.target_words_used ?? []).map((u) => ({
    lemma: u.lemma,
    correct: u.correct === true,
    form: u.form,
  }));
  return { shown, kept, target_words_used, overall_ok: shown.length === 0 };
}

/** Every [start, end) where `needle` occurs in `hay`. */
function ranges(hay: string, needle: string): [number, number][] {
  const out: [number, number][] = [];
  if (!needle) return out;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push([i, i + needle.length]);
  return out;
}

/** Comparison key for a lemma: normalize(), then drop one leading article ("la casa" → "casa"). */
export function lemmaKey(s: string): string {
  return normalize(s).replace(/^(?:el|la|los|las|un|una|unos|unas) /, "");
}

const sameLemma = (a: string | null | undefined, b: string) => !!a && lemmaKey(a) === lemmaKey(b);

/** The matching session target's exact lemma (so "la casa" or "Casa" becomes "casa"), else `lemma` unchanged. */
export function canonicalLemma(lemma: string, targets: TargetWord[]): string {
  return targets.find((t) => sameLemma(t.lemma, lemma))?.lemma ?? lemma;
}

/** Echo rule: a learner turn that repeats the tutor needs at least this many words of its own to earn credit. */
const ECHO_MIN_NEW_WORDS = 3;

export function validateTargetWords(args: ValidateTargetWordsArgs): TargetWordVerdict[] {
  const { rawText, targets, used, kept, alreadyCredited, tutorPrevious } = args;
  const lowerRaw = rawText.toLowerCase();
  const rawTokens = normalize(rawText).split(" ").filter(Boolean);
  const wordCount = rawTokens.length;
  const tutorNorm = tutorPrevious ? ` ${normalize(tutorPrevious)} ` : null;
  const tutorTokens = new Set(tutorNorm?.split(" ").filter(Boolean));
  const newWords = rawTokens.filter((t) => !tutorTokens.has(t)).length;
  const seen: string[] = [];

  return used.map((u): TargetWordVerdict => {
    const target = targets.find((t) => sameLemma(t.lemma, u.lemma));
    if (!target) return { lemma: u.lemma, event: null, reason: "not a session target" };
    const lemma = target.lemma;
    if (seen.some((s) => sameLemma(s, lemma))) return { lemma, event: null, reason: "duplicate in this utterance" };
    seen.push(lemma);

    const form = u.form?.trim() ?? "";
    const formRanges = ranges(lowerRaw, form.toLowerCase());
    if (formRanges.length === 0) return { lemma, event: null, reason: form ? "form not in transcript" : "no form" };

    // Errors that touch this word: span overlaps the form in rawText, or the error names the lemma.
    const blocking = kept.filter(
      (e) =>
        e.confidence >= TUTOR.keepConfidence &&
        (sameLemma(e.lemma, lemma) ||
          ranges(rawText, e.span).some(([s, en]) => formRanges.some(([fs, fe]) => s < fe && fs < en))),
    );
    if (blocking.some((e) => e.confidence >= TUTOR.showConfidence))
      return { lemma, event: "spoken_incorrect", reason: "error on this word (confidence >= show)" };
    if (blocking.length > 0) return { lemma, event: null, reason: "low-confidence error on this word" };
    if (!u.correct) return { lemma, event: null, reason: "marked incorrect, no confident error" };
    if (wordCount < 4) return { lemma, event: null, reason: "utterance under 4 words" };
    // The form appears in the tutor's last line and the learner added fewer than 3 words of their own.
    const formNorm = normalize(form);
    if (tutorNorm && formNorm && tutorNorm.includes(` ${formNorm} `) && newWords < ECHO_MIN_NEW_WORDS)
      return { lemma, event: null, reason: "echo of the tutor" };
    if (alreadyCredited.some((c) => sameLemma(c, lemma)))
      return { lemma, event: null, reason: "already credited this session" };
    return { lemma, event: "spoken_correct", reason: "ok" };
  });
}
