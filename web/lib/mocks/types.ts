// HACK: local mirrors of response shapes that have no /shared schema yet (see docs/plan-shravan.md §2 gaps).
// TODO(demo): replace with imports from /shared once Andrew/Karthik define them.
import type { TutorRecap } from "../tutor/types";

export type WordState = "new" | "seen" | "learning" | "known" | "mastered" | "known_assumed";

export interface VocabWord {
  lemma: string;
  article?: string; // nouns only
  english: string;
  state: WordState;
}

export interface VocabResponse {
  learning: VocabWord[];
  known: VocabWord[]; // "Your vocabulary"
  mastered: VocabWord[];
  streakDays: number;
}

export type DataItemKind = "word" | "event" | "article";

export interface DataItem {
  id: string;
  kind: DataItemKind;
  label: string; // e.g. lemma, "hover: casa", article title
  detail?: string; // e.g. domain, timestamp
}

export interface DataResponse {
  words: DataItem[];
  events: DataItem[];
  articles: DataItem[];
}

export interface TutorContextMock {
  hoveredWords: { lemma: string; sentence: string }[];
  dueWords: string[];
  articleTitles: string[];
  level: "beginner" | "intermediate" | "upper-intermediate";
  topErrors: string[];
}

export interface SettingsMock {
  level: "beginner" | "intermediate" | "upper-intermediate";
  intensity: "off" | "light" | "normal" | "immersion";
  perPageCap: number;
  allowlist: string[];
  pausedSites: string[];
  useReadingInLessons: boolean;
}

export type { TutorRecap };
