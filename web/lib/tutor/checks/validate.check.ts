/** Run: npx tsx web/lib/tutor/checks/validate.check.ts (prints "ok"). */
import assert from "node:assert/strict";
import { correctResponseFixture, rawTextFixture, tutorContextFixture } from "@parrot/shared";
import type { CorrectionError } from "@parrot/shared";
import type { ModelCorrection, ModelCorrectionError } from "../types";
import { canonicalLemma, lemmaKey, normalize, validateCorrection, validateTargetWords } from "../validate";

const err = (over: Partial<ModelCorrectionError>): ModelCorrectionError => ({
  span: "yo tiene",
  type: "conjugation",
  correction: "yo tengo",
  explanation_en: "x",
  severity: 2,
  confidence: 0.9,
  lemma: null,
  ...over,
});
const model = (errors: ModelCorrectionError[], used: ModelCorrection["target_words_used"] = []): ModelCorrection => ({
  errors,
  target_words_used: used,
  overall_ok: true, // deliberately wrong: must be recomputed
});

// ---- normalize ----
assert.equal(normalize("  ¿Está   BIEN, señor?! "), "esta bien señor");
assert.equal(normalize("AÑO"), "año");
assert.notEqual(normalize("año"), normalize("ano"));
assert.equal(normalize("pingüino"), "pinguino");

// ---- validateCorrection ----
const fx = correctResponseFixture.correction;
const raw = rawTextFixture;
const a = validateCorrection(raw, { errors: fx.errors, target_words_used: [{ lemma: "huelga", form: "huelga", correct: true }], overall_ok: true });
assert.deepEqual(a.shown, fx.errors); // both fixture errors shown, untouched
assert.deepEqual(a.kept, fx.errors);
assert.equal(a.overall_ok, false);
assert.deepEqual(a.target_words_used, [{ lemma: "huelga", form: "huelga", correct: true }]);

// span not in text (also: case must match exactly, and empty span)
assert.equal(validateCorrection(raw, model([err({ span: "yo tienes" })])).kept.length, 0);
assert.equal(validateCorrection(raw, model([err({ span: "Yo tiene" })])).kept.length, 0);
assert.equal(validateCorrection(raw, model([err({ span: "" })])).kept.length, 0);

// accent-only, punctuation-only, case-only
assert.equal(validateCorrection("mi casa esta aquí", model([err({ span: "esta", correction: "está" })])).kept.length, 0);
assert.equal(validateCorrection("hola como estas", model([err({ span: "como estas", correction: "¿cómo estás?" })])).kept.length, 0);
assert.equal(validateCorrection("vivo en méxico", model([err({ span: "méxico", correction: "México" })])).kept.length, 0);
// ñ vs n is a real difference
assert.equal(validateCorrection("tengo veinte anos", model([err({ span: "anos", correction: "años" })])).shown.length, 1);

// thresholds
const b = validateCorrection(raw, model([err({ confidence: 0.69 })]));
assert.equal(b.kept.length, 1);
assert.equal(b.shown.length, 0);
assert.equal(b.overall_ok, true);
assert.equal(validateCorrection(raw, model([err({ confidence: 0.49 })])).kept.length, 0);
assert.equal(validateCorrection(raw, model([err({ confidence: 1.4 })])).shown[0].confidence, 1);
assert.equal(validateCorrection(raw, model([err({ confidence: NaN })])).kept.length, 0);
assert.equal(validateCorrection(raw, model([err({ severity: 7.2 })])).shown[0].severity, 3);
assert.equal(validateCorrection(raw, model([err({ severity: 0 })])).shown[0].severity, 1);
assert.equal(validateCorrection(raw, model([err({ severity: 1.6 })])).shown[0].severity, 2);

// clean input
const c = validateCorrection(raw, { errors: [], target_words_used: [], overall_ok: false });
assert.deepEqual(c, { shown: [], kept: [], target_words_used: [], overall_ok: true });

// ---- turn flags ----
const used = [{ lemma: "huelga", form: "huelga", correct: true }];
// English: no errors, no target-word credit, the Spanish version is passed on.
assert.deepEqual(
  validateCorrection("Hi, my name is Shravan", { ...model([err({ span: "my name" })], used), answer: "english", spanish_version: " Hola, me llamo Shravan. " }),
  { shown: [], kept: [], target_words_used: [], overall_ok: false, flag: "english", spanish_version: "Hola, me llamo Shravan." },
);
// A Spanish sentence the model called English: the flag is dropped and grading goes on as usual.
const notEnglish = validateCorrection(raw, { ...model([err({})], used), answer: "english", spanish_version: "x" });
assert.equal(notEnglish.flag, undefined);
assert.equal(notEnglish.shown.length, 1);
// Unclear: no errors either.
assert.deepEqual(validateCorrection(raw, { ...model([err({})], used), answer: "unclear" }), {
  shown: [], kept: [], target_words_used: [], overall_ok: false, flag: "unclear",
});
// Off topic needs a tutor line; with one, errors and target words are kept.
assert.equal(validateCorrection(raw, { ...model([], used), answer: "off_topic" }).flag, undefined);
const off = validateCorrection(raw, { ...model([err({})], used), answer: "off_topic" }, "¿Qué piensas de la noticia?");
assert.equal(off.flag, "off_topic");
assert.equal(off.shown.length, 1);
assert.equal(off.target_words_used.length, 1);
assert.equal(validateCorrection(raw, { ...model([]), answer: "off_topic" }, "¿Qué?").overall_ok, false);
assert.deepEqual(validateCorrection(raw, { ...model([]), answer: "answered", spanish_version: null }), c);

// ---- validateTargetWords (§1.6) ----
const targets = tutorContextFixture.targetWords; // huelga, aprovechar, casa
const use = (lemma: string, form: string | undefined, correct = true) => ({ lemma, form, correct });
const kerr = (over: Partial<CorrectionError>): CorrectionError => ({
  span: "la huelga",
  type: "agreement",
  correction: "el huelga",
  explanation_en: "x",
  severity: 2,
  confidence: 0.9,
  lemma: null,
  ...over,
});
const run = (over: Partial<Parameters<typeof validateTargetWords>[0]>) =>
  validateTargetWords({ rawText: raw, targets, used: [use("huelga", "huelga")], kept: [], alreadyCredited: [], ...over });
const ev = (over: Partial<Parameters<typeof validateTargetWords>[0]>) => run(over).map((v) => v.event);

// Baseline pass: the fixture's own errors do not touch "huelga".
assert.deepEqual(run({ kept: a.kept }), [{ lemma: "huelga", event: "spoken_correct", reason: "ok" }]);

// Rule 1: lemma is a session target.
assert.deepEqual(ev({}), ["spoken_correct"]);
assert.deepEqual(ev({ used: [use("problema", "problema")] }), [null]);

// Rule 2: form present and a substring of the transcript (case-insensitive).
assert.deepEqual(ev({ rawText: "La Huelga no termina hoy" }), ["spoken_correct"]);
assert.deepEqual(ev({ used: [use("huelga", "huelgas")] }), [null]);
assert.deepEqual(ev({ used: [use("huelga", undefined)] }), [null]);

// Rule 3: correct is true and no kept error overlaps the form or names the lemma.
assert.deepEqual(ev({ kept: [kerr({ span: "yo tiene", lemma: "tener" })] }), ["spoken_correct"]);
assert.deepEqual(ev({ used: [use("huelga", "huelga", false)] }), [null]); // incorrect, but no confident error
assert.deepEqual(ev({ kept: [kerr({ confidence: 0.6 })] }), [null]); // overlap, 0.5 <= c < 0.7
assert.deepEqual(ev({ kept: [kerr({ span: "yo tiene", lemma: "huelga", confidence: 0.6 })] }), [null]); // same lemma
// spoken_incorrect only at >= 0.7
assert.deepEqual(ev({ kept: [kerr({ confidence: 0.7 })] }), ["spoken_incorrect"]);
assert.deepEqual(ev({ kept: [kerr({ span: "yo tiene", lemma: "huelga", confidence: 0.95 })] }), ["spoken_incorrect"]);
assert.deepEqual(ev({ kept: [kerr({ confidence: 0.69 })], used: [use("huelga", "huelga", false)] }), [null]);

// Rule 4: at least 4 words.
assert.deepEqual(ev({ rawText: "la huelga no termina" }), ["spoken_correct"]);
assert.deepEqual(ev({ rawText: "¿La huelga, sí?" }), [null]);

// Rule 5: not already credited this session.
assert.deepEqual(ev({ alreadyCredited: ["casa"] }), ["spoken_correct"]);
assert.deepEqual(ev({ alreadyCredited: ["huelga"] }), [null]);

// Same lemma reported twice in one utterance is credited once.
assert.deepEqual(ev({ used: [use("huelga", "huelga"), use("huelga", "huelga")] }), ["spoken_correct", null]);

// ---- lemmaKey / canonicalLemma (the model may echo the article or change case/accents) ----
assert.equal(lemmaKey("La Casa"), "casa");
assert.equal(lemmaKey("  los   Problemas "), "problemas");
assert.equal(lemmaKey("la"), "la"); // a bare article is not stripped
assert.equal(lemmaKey("casá"), "casa");
assert.equal(canonicalLemma("la casa", targets), "casa");
assert.equal(canonicalLemma("Huelga", targets), "huelga");
assert.equal(canonicalLemma("perro", targets), "perro");
assert.deepEqual(run({ used: [use("la huelga", "huelga")] }), [{ lemma: "huelga", event: "spoken_correct", reason: "ok" }]);

// ---- echo rule: the form is in the tutor's last line and the learner added < 3 words of their own ----
const tutorPrevious = "¿Y qué piensas de la Huelga de hoy?";
assert.deepEqual(run({ rawText: "pienso que la huelga de hoy", tutorPrevious }), [
  { lemma: "huelga", event: null, reason: "echo of the tutor" },
]);
assert.deepEqual(ev({ rawText: "creo que la huelga de hoy es terrible", tutorPrevious }), ["spoken_correct"]); // 3 new words
assert.deepEqual(ev({ rawText: "hoy en la ciudad huelga", tutorPrevious: "¿Qué pasó hoy en la ciudad?" }), ["spoken_correct"]); // form not in tutor line
assert.deepEqual(ev({ rawText: "pienso que la huelga de hoy" }), ["spoken_correct"]); // no tutorPrevious
// An echo with a confident error on the word is still spoken_incorrect.
assert.deepEqual(ev({ rawText: "pienso que la huelga de hoy", tutorPrevious, kept: [kerr({})] }), ["spoken_incorrect"]);

console.log("ok");
