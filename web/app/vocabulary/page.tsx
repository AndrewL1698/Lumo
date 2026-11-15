"use client";
import { DataDeleteResponse, DataResponse, VocabResponse, type DataDeleteRequest } from "@parrot/shared";
import { useEffect, useState } from "react";
import { KnownData } from "@/components/privacy/KnownData";
import { Jar } from "@/components/vocab/Jar";
import { StreakBadge, VocabLists } from "@/components/vocab/VocabLists";
import { justLearned, saveKnownSnapshot } from "@/components/vocab/justLearned";
import { btn, EmptyState, ErrorState, PageHeader } from "@/components/ui/PageHeader";
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

  // Everything Luci stores about you lives under the jar (D-024): the same words, plus articles, activity and delete.
  const stored = useFetch("/api/data", DataResponse, { refetchOnFocus: true });
  const [busy, setBusy] = useState(false);
  const [keepsOpen, setKeepsOpen] = useState(false);
  useEffect(() => {
    if (window.location.hash === "#keeps") setKeepsOpen(true); // the old "What Luci knows" link lands here
  }, []);

  // Only report success after the server confirms, then refetch both lists so the screen matches the database.
  async function onDelete(req: DataDeleteRequest): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) return false;
      DataDeleteResponse.parse(await res.json());
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
    await Promise.all([reload(), stored.reload()]);
    return true;
  }

  const total = data ? data.counts.learning + data.counts.known + data.counts.mastered : 0;
  return (
    <>
      <PageHeader kicker="Vocabulary" title="Your jar" subtitle="Every word you catch is a firefly. It only glows steady once you've said it correctly out loud. Point at a word to remove it." />

      {loading && (
        <div role="status" aria-label="Loading" className="grid gap-12 md:grid-cols-[26rem_1fr]">
          <div className="mx-auto aspect-[300/360] w-full max-w-[26rem] animate-pulse rounded-[40%_40%_12%_12%/20%_20%_6%_6%] bg-line" />
          <div className="space-y-4 pt-10">
            <div className="h-10 w-48 animate-pulse rounded-xs bg-line" />
            <div className="h-6 w-64 animate-pulse rounded-xs bg-line" />
          </div>
        </div>
      )}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && total === 0 && data.streakDays === 0 && (
        <EmptyState>Your jar is empty. Read a page with Lumo switched on and hover a Spanish word to catch your first firefly.</EmptyState>
      )}

      {data && (total > 0 || data.streakDays > 0) && (
        <div className="space-y-14">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <StreakBadge days={data.streakDays} />
            <button type="button" onClick={() => void reload()} className={btn.secondary}>
              Refresh
            </button>
          </div>
          {freshWords.length > 0 && (
            <p role="status" className="font-display text-2xl font-semibold">
              Just lit up:{" "}
              {freshWords.map((w, i) => (
                <span key={w.lemma}>
                  {i > 0 && ", "}
                  <span className="glow-known">{w.lemma}</span>
                  <span className="font-sans text-lg font-normal text-muted"> {w.english}</span>
                </span>
              ))}
            </p>
          )}
          <Jar data={data} fresh={fresh} />
          <VocabLists data={data} fresh={fresh} onDelete={(lemma) => void onDelete({ kind: "word", lemma })} busy={busy} />
        </div>
      )}

      {data && (
        <details
          id="keeps"
          open={keepsOpen}
          onToggle={(e) => setKeepsOpen(e.currentTarget.open)}
          className="mt-16 border-t border-line pt-8"
        >
          <summary className="cursor-pointer list-none font-display text-2xl font-extrabold transition-colors duration-150 hover:text-accent [&::-webkit-details-marker]:hidden">
            What Lumo keeps about you
            <span className="ml-3 font-sans text-base font-normal text-muted">
              {keepsOpen ? "Hide" : "Articles, activity, and delete everything"}
            </span>
          </summary>
          <div className="mt-8">
            {stored.error && !stored.data && <ErrorState message={stored.error} onRetry={() => void stored.reload()} />}
            {stored.data && <KnownData data={stored.data} onDelete={onDelete} hideWords />}
          </div>
        </details>
      )}
    </>
  );
}
