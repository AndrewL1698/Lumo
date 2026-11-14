"use client";
import { VocabResponse } from "@parrot/shared";
import { useEffect, useState } from "react";
import { VocabLists } from "@/components/vocab/VocabLists";
import { justLearned, saveKnownSnapshot } from "@/components/vocab/justLearned";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  // Refetch on window focus so a word that just flipped to "known" in the tutor shows up (demo step 4).
  const { data, error, loading, reload } = useFetch("/api/vocab", VocabResponse, { refetchOnFocus: true });
  // Highlight words that just moved to "known" (from the tutor, or since this page was last loaded).
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const known = data.known.map((w) => w.lemma);
    const f = justLearned(known);
    setFresh(f);
    saveKnownSnapshot(known, f);
  }, [data]);
  const freshWords = data ? data.known.filter((w) => fresh.has(w.lemma)) : [];

  const total = data ? data.counts.learning + data.counts.known + data.counts.mastered : 0;
  return (
    <>
      <PageHeader title="Your vocabulary" subtitle="Words you're learning, words you know, and words you've mastered.">
        <button type="button" onClick={() => void reload()} className="rounded-lg border border-slate-300 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
          Refresh
        </button>
      </PageHeader>
      {loading && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && total === 0 && data.streakDays === 0 && (
        <EmptyState>No words yet. Read a page with Parrot switched on and hover a Spanish word to start.</EmptyState>
      )}
      {freshWords.length > 0 && (
        <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 text-lg text-green-900">
          🎉 New in your vocabulary:{" "}
          <strong>{freshWords.map((w) => (w.article ? `${w.article} ${w.lemma}` : w.lemma) + ` (${w.english})`).join(", ")}</strong>
        </p>
      )}
      {data && (total > 0 || data.streakDays > 0) && <VocabLists data={data} fresh={fresh} />}
    </>
  );
}
