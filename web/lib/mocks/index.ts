// HACK: fixtures for building UI without the backend. Used when NEXT_PUBLIC_USE_MOCKS=1 or an API call fails.
import type { CorrectionResult } from "../tutor/types";
import type { TutorRecap } from "../tutor/types";
import type { DataResponse, SettingsMock, TutorContextMock, VocabResponse } from "./types";

export const MOCK_PAIRING_CODE = "482913"; // TODO(demo): static code; no endpoint defines one yet

// Raw transcript = verbatim STT: no punctuation/accents added.
export const MOCK_RAW_TRANSCRIPT = "creo que la problema es que no puedo aprovechar el tiempo y es muy bueno";

// Covers: a confident agreement error, a low-confidence error (hidden), a span NOT in the
// transcript (hidden), a correct target word, and a wrong one.
export const MOCK_CORRECTION: CorrectionResult = {
  utterance_id: "u_1",
  overall_ok: false,
  errors: [
    {
      span: "la problema",
      type: "agreement",
      correction: "el problema",
      explanation_en: "'Problema' is masculine even though it ends in -a.",
      severity: 2,
      confidence: 0.92,
      lemma: "problema",
    },
    {
      span: "es muy bueno",
      type: "word_choice",
      correction: "es muy buena",
      explanation_en: "Maybe the speaker meant a feminine noun here.",
      severity: 1,
      confidence: 0.5, // below 0.7 -> must not render
    },
    {
      span: "no puedo aprovechar el tiempo bien", // not verbatim -> must not render
      type: "extra_word",
      correction: "no puedo aprovechar el tiempo",
      explanation_en: "Not actually said.",
      severity: 1,
      confidence: 0.95,
    },
  ],
  target_words_used: [{ lemma: "aprovechar", correct: true }],
  overall_ok: false,
};

export const MOCK_CORRECTION_CLEAN: CorrectionResult = {
  utterance_id: "u_2",
  errors: [],
  target_words_used: [],
  overall_ok: true,
};

export const MOCK_TUTOR_OPENER =
  "Vi que hoy leíste sobre la huelga del transporte. ¿Qué opinas?";
export const MOCK_TUTOR_REPLY =
  "Entiendo. Dices que el problema es el tiempo. ¿Cómo podrías aprovechar mejor tu día?";

export const MOCK_TUTOR_CONTEXT: TutorContextMock = {
  hoveredWords: [
    { lemma: "huelga", sentence: "The transport strike entered its third day." },
    { lemma: "aprovechar", sentence: "Commuters try to make the most of the delays." },
  ],
  dueWords: ["casa", "tiempo", "problema"],
  articleTitles: ["La huelga del transporte llega a su tercer día"],
  level: "beginner",
  topErrors: ["agreement"],
};

export const MOCK_RECAP: TutorRecap = {
  topErrors: [
    { type: "agreement", count: 2, example: "la problema → el problema" },
    { type: "conjugation", count: 1, example: "yo puede → yo puedo" },
    { type: "word_order", count: 1 },
  ],
  wordsNowKnown: ["aprovechar"],
  wordsToReview: ["huelga", "tiempo"],
};

export const MOCK_VOCAB: VocabResponse = {
  streakDays: 3,
  learning: [
    { lemma: "huelga", article: "la", english: "strike", state: "learning" },
    { lemma: "tiempo", article: "el", english: "time", state: "learning" },
    { lemma: "problema", article: "el", english: "problem", state: "learning" },
  ],
  known: [
    { lemma: "aprovechar", english: "to take advantage of", state: "known" },
    { lemma: "casa", article: "la", english: "house", state: "known" },
  ],
  mastered: [
    { lemma: "agua", article: "el", english: "water", state: "mastered" },
    { lemma: "día", article: "el", english: "day", state: "mastered" },
  ],
};

export const MOCK_VOCAB_EMPTY: VocabResponse = { streakDays: 0, learning: [], known: [], mastered: [] };

export const MOCK_DATA: DataResponse = {
  words: [
    { id: "w1", kind: "word", label: "casa", detail: "known" },
    { id: "w2", kind: "word", label: "huelga", detail: "learning" },
  ],
  events: [
    { id: "e1", kind: "event", label: "hover: huelga", detail: "Sat 9:41am" },
    { id: "e2", kind: "event", label: "knew_it: casa", detail: "Sat 9:42am" },
  ],
  articles: [
    { id: "a1", kind: "article", label: "La huelga del transporte llega a su tercer día", detail: "example-news.com" },
  ],
};

export const MOCK_SETTINGS: SettingsMock = {
  level: "beginner",
  intensity: "normal",
  perPageCap: 25,
  allowlist: ["en.wikipedia.org"],
  pausedSites: [],
  useReadingInLessons: true,
};
