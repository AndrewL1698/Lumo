"use client";
import { VocabResponse } from "@parrot/shared";
import { VocabLists } from "@/components/vocab/VocabLists";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  // Refetch on window focus so a word that just flipped to "known" in the tutor shows up (demo step 4).
  const { data, error, loading, reload } = useFetch("/api/vocab", VocabResponse, { refetchOnFocus: true });
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
      {data && (total > 0 || data.streakDays > 0) && <VocabLists data={data} />}
    </>
  );
}
