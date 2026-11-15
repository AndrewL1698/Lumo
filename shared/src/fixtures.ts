/**
 * Mock data for every API response, shared by the web stubs, Shravan's pages and the extension.
 * Each value is parsed by its schema at import, so a fixture can never drift from the contract.
 */
import { DataDeleteResponse, DataResponse, PairResponse, VocabResponse } from "./api";
import { CandidatesResponse } from "./candidates";
import { EventsResponse } from "./events";
import { Settings } from "./settings";
import { TranslateResponse } from "./translate";
import { CorrectResponse, Recap, SttTokenResponse, TutorContext, TutorTranslateResponse } from "./tutor";

const now = "2026-11-14T15:00:00.000Z";
const tomorrow = "2026-11-15T15:00:00.000Z";

export const settingsFixture = Settings.parse({
  level: "intermediate",
  intensity: "normal",
  perPageCap: 25,
  allowlist: ["https://www.bbc.com", "https://en.wikipedia.org"],
  pausedSites: [],
  useReadingInLessons: true,
});

export const pairResponseFixture = PairResponse.parse({ token: "demo-extension-token" });

export const candidatesResponseFixture = CandidatesResponse.parse({
  generatedAt: 1763132400000,
  candidates: [
    { lemma: "casa", state: "learning", isDue: true, hoveredRecently: true, onWeakList: false, isNewInBand: false, isMastered: false },
    { lemma: "huelga", state: "new", isDue: false, hoveredRecently: false, onWeakList: false, isNewInBand: true, isMastered: false },
    { lemma: "aprovechar", state: "seen", isDue: false, hoveredRecently: true, onWeakList: true, isNewInBand: false, isMastered: false },
    { lemma: "tiempo", state: "mastered", isDue: false, hoveredRecently: false, onWeakList: false, isNewInBand: false, isMastered: true },
  ],
});

export const translateResponseFixture = TranslateResponse.parse({
  items: [
    { span: "the strike", replacement: "la huelga", lemma: "huelga" },
    null, // sense mismatch: no swap
  ],
});

export const eventsResponseFixture = EventsResponse.parse({ accepted: 3, duplicates: 0 });

export const tutorContextFixture = TutorContext.parse({
  sessionId: "sess_demo_1",
  hoveredWords: [
    { lemma: "huelga", sentence: "The transit strike entered its third day on Friday." },
    { lemma: "aprovechar", sentence: "Commuters tried to make the most of the quiet streets." },
  ],
  dueWords: ["casa"],
  articleTitles: ["Transit strike enters third day"],
  level: "intermediate",
  topErrors: ["agreement: la problema → el problema"],
  targetWords: [
    { lemma: "huelga", article: "la", english: "strike", source: "hovered" },
    { lemma: "aprovechar", english: "to make the most of", source: "hovered" },
    { lemma: "casa", article: "la", english: "house", source: "due" },
  ],
  plan: {
    article: { title: "Transit strike enters third day", why: "You read it today and hovered 2 words in it" },
    words: [
      { lemma: "huelga", english: "strike", reason: 'Hovered 2h ago (you clicked "Didn\'t know") in: "The transit strike entered its third day on Friday."' },
      { lemma: "aprovechar", english: "to make the most of", reason: 'Hovered 2h ago in: "Commuters tried to make the most of the quiet streets."' },
      { lemma: "casa", english: "house", reason: "Due for review" },
    ],
    watchError: "la problema → el problema (agreement)",
  },
});

/** Raw transcript the correction fixtures refer to. */
export const rawTextFixture = "yo tiene la problema porque la huelga no termina";

/** /api/tutor/correct with two errors and one target word flipping to known. */
export const correctResponseFixture = CorrectResponse.parse({
  serverMs: 840,
  correction: {
    utterance_id: "utt_demo_1",
    errors: [
      {
        span: "yo tiene",
        type: "conjugation",
        correction: "yo tengo",
        explanation_en: "With 'yo', 'tener' becomes 'tengo'.",
        severity: 2,
        confidence: 0.95,
        lemma: "tener",
      },
      {
        span: "la problema",
        type: "agreement",
        correction: "el problema",
        explanation_en: "'Problema' is masculine even though it ends in -a.",
        severity: 2,
        confidence: 0.9,
        lemma: "problema",
      },
    ],
    target_words_used: [{ lemma: "huelga", form: "huelga", correct: true }],
    overall_ok: false,
  },
  wordUpdates: [{ lemma: "huelga", from: "learning", to: "known" }],
});

/** /api/tutor/correct for a clean sentence. */
export const correctResponseCleanFixture = CorrectResponse.parse({
  serverMs: 610,
  correction: {
    utterance_id: "utt_demo_2",
    errors: [],
    target_words_used: [],
    overall_ok: true,
  },
  wordUpdates: [],
});

/** /api/tutor/correct when the learner answered in English ("Hi, my name is Shravan"). */
export const correctResponseEnglishFixture = CorrectResponse.parse({
  serverMs: 720,
  correction: {
    utterance_id: "utt_demo_3",
    errors: [],
    target_words_used: [],
    overall_ok: false,
    flag: "english",
    spanish_version: "Hola, me llamo Shravan.",
  },
  wordUpdates: [],
});

/** /api/tutor/correct when the answer has nothing to do with the tutor's question. */
export const correctResponseOffTopicFixture = CorrectResponse.parse({
  serverMs: 690,
  correction: {
    utterance_id: "utt_demo_4",
    errors: [],
    target_words_used: [],
    overall_ok: false,
    flag: "off_topic",
  },
  wordUpdates: [],
});

/** What /api/tutor/reply streams (text/plain) in mock mode. */
export const replyTextFixture =
  "Claro, entiendo. El problema es que la huelga sigue, ¿verdad? ¿Cómo llegas al trabajo esta semana?";

/** /api/tutor/translate for `replyTextFixture`. */
export const tutorTranslateResponseFixture = TutorTranslateResponse.parse({
  english: "Sure, I understand. The problem is that the strike goes on, right? How are you getting to work this week?",
});

export const recapFixture = Recap.parse({
  topErrors: [
    {
      type: "agreement",
      span: "la problema",
      correction: "el problema",
      explanation_en: "'Problema' is masculine even though it ends in -a.",
      count: 2,
    },
    {
      type: "conjugation",
      span: "yo tiene",
      correction: "yo tengo",
      explanation_en: "With 'yo', 'tener' becomes 'tengo'.",
      count: 1,
    },
  ],
  wordsNowKnown: ["huelga"],
  reviewTomorrow: ["casa", "aprovechar"],
  summary_en:
    "You kept the conversation going and used 'huelga' correctly. Next time, watch the gender of words like 'problema'.",
  tips: [
    "Some nouns ending in -a are masculine: el problema, el mapa.",
    "With 'yo', use the yo form: yo tengo, yo quiero.",
  ],
});

export const sttTokenResponseFixture = SttTokenResponse.parse({
  token: "sutkn_mock",
  model: "scribe_v2_realtime",
});

export const vocabResponseFixture = VocabResponse.parse({
  learning: [
    { lemma: "casa", article: "la", english: "house", state: "learning", dueAt: now },
    { lemma: "aprovechar", article: null, english: "to make the most of", state: "learning", dueAt: tomorrow },
  ],
  known: [{ lemma: "huelga", article: "la", english: "strike", state: "known", dueAt: tomorrow }],
  mastered: [{ lemma: "tiempo", article: "el", english: "time; weather", state: "mastered", dueAt: null }],
  counts: { learning: 2, known: 1, mastered: 1 },
  streakDays: 2,
});

export const dataResponseFixture = DataResponse.parse({
  words: [
    {
      lemma: "huelga",
      state: "known",
      fsrsCard: null,
      seenCount: 3,
      seenArticles: ["a1b2c3"],
      lastHoverAt: now,
      dueAt: tomorrow,
    },
  ],
  events: [
    { id: "6f1c2a8e-0000-4000-8000-000000000001", type: "hover", lemma: "huelga", articleKey: "a1b2c3", ts: now },
    { id: "6f1c2a8e-0000-4000-8000-000000000002", type: "spoken_correct", lemma: "huelga", articleKey: null, ts: now },
  ],
  articles: [
    { id: "art_1", articleKey: "a1b2c3", title: "Transit strike enters third day", domain: "bbc.com", ts: now },
  ],
});

export const dataDeleteResponseFixture = DataDeleteResponse.parse({ deleted: 1 });
