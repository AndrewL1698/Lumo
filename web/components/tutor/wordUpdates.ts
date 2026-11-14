import type { WordUpdate } from "@parrot/shared";

/** Lemmas that just flipped to "known" (drives the KnownToast). */
export function newlyKnown(updates: WordUpdate[] | undefined): string[] {
  return (updates ?? []).filter((u) => u.to === "known" && u.from !== "known").map((u) => u.lemma);
}
