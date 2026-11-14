"use client";
import { VocabResponse } from "@parrot/shared";
import { useEffect, useState } from "react";
import { VocabLists } from "@/components/vocab/VocabLists";
import { justLearned, saveKnownSnapshot } from "@/components/vocab/justLearned";
import { btn, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader kicker="Vocabulary" title="Your jar" subtitle="Every word you know glows here. A word only lights up after you use it correctly out loud.">
        <button type="button" onClick={() => void reload()} className={btn.secondary}>
          Refresh
        </button>
      </PageHeader>
      {loading && <LoadingState shape="columns" />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && total === 0 && data.streakDays === 0 && (
        <EmptyState>No words yet. Read a page with Luci switched on and hover a Spanish word to start.</EmptyState>
      )}
      {freshWords.length > 0 && (
        <p role="status" className="mb-6 rounded-sm border border-sun-line bg-sun px-5 py-4 text-lg">
          <span className="mr-3 text-xs font-bold uppercase tracking-[0.08em] text-accent">Just lit up</span>
          {freshWords.map((w, i) => (
            <span key={w.lemma}>
              {i > 0 && ", "}
              <strong>{w.article ? `${w.article} ${w.lemma}` : w.lemma}</strong>
              <span className="text-muted"> {w.english}</span>
            </span>
          ))}
        </p>
      )}
      {data && (total > 0 || data.streakDays > 0) && <VocabLists data={data} fresh={fresh} />}
    </>
  );
}
