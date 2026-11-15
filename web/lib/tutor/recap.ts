/** End-of-session recap lists (task 14). Pure: no I/O. The prose comes from writeRecap in lib/claude.ts. */
import type { Recap } from "@parrot/shared";
import { TUTOR } from "../config";
import { errorKey } from "./policy";
import type { SessionState } from "./types";

export type RecapLists = Pick<Recap, "topErrors" | "wordsNowKnown" | "reviewTomorrow">;

/**
 * topErrors: only errors the learner was shown (confidence >= TUTOR.showConfidence), grouped by errorKey,
 * most frequent first (ties: earliest seen first), top 3, each with its latest example.
 * wordsNowKnown: lemmas credited this session. reviewTomorrow: target lemmas not credited.
 */
export function buildRecapLists(session: SessionState): RecapLists {
  const groups = new Map<string, { first: number; count: number; latest: SessionState["allErrors"][number] }>();
  session.allErrors.forEach((e, i) => {
    if (e.confidence < TUTOR.showConfidence) return;
    const key = errorKey(e);
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.latest = e;
    } else groups.set(key, { first: i, count: 1, latest: e });
  });
  const topErrors = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, 3)
    .map(({ latest: e, count }) => ({
      type: e.type,
      span: e.span,
      correction: e.correction,
      explanation_en: e.explanation_en,
      count,
    }));
  const credited = new Set(session.creditedLemmas.map((l) => l.toLowerCase()));
  return {
    topErrors,
    wordsNowKnown: [...session.creditedLemmas],
    reviewTomorrow: session.context.targetWords.map((w) => w.lemma).filter((l) => !credited.has(l.toLowerCase())),
  };
}

/** The user message for writeRecap: the lists as a short XML block, plus the learner's level. */
export function buildRecapUserMessage(lists: RecapLists, level: string): string {
  const errors = lists.topErrors.length
    ? lists.topErrors
        .map((e) => `- "${e.span}" → "${e.correction}" (${e.explanation_en}) ×${e.count}`)
        .join("\n")
    : "none";
  return [
    `<level>${level}</level>`,
    `<mistakes>\n${errors}\n</mistakes>`,
    `<words_used_correctly>${lists.wordsNowKnown.join(", ") || "none"}</words_used_correctly>`,
    `<words_to_practise>${lists.reviewTomorrow.join(", ") || "none"}</words_to_practise>`,
  ].join("\n");
}
