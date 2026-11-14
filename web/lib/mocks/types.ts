// HACK: local mirrors of response shapes that have no /shared schema yet (see docs/plan-shravan.md §2 gaps).
// TODO(demo): replace with imports from /shared once Andrew/Karthik define them.
import type { Level, WordState } from "../tutor/types";

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

export interface SettingsMock {
  level: Level;
  intensity: "off" | "light" | "normal" | "immersion";
  perPageCap: number;
  allowlist: string[];
  pausedSites: string[];
  useReadingInLessons: boolean;
}

export type { Level, WordState };
