"use client";
// D-022: the learner's course. Which units are done, where they are now, and the words of the current unit.
import { ProgressResponse, type ProgressUnit } from "@parrot/shared";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

const STATE_LOOK: Record<string, string> = {
  known: "border-glow bg-glow/25 text-ink font-bold",
  mastered: "border-glow bg-glow/40 text-ink font-bold",
  learning: "border-accent text-ink",
  seen: "border-line text-muted",
  new: "border-line text-muted",
  known_assumed: "border-line text-muted",
};

function Status({ u }: { u: ProgressUnit }) {
  if (u.status === "done") return <span className="font-bold text-ink">Done</span>;
  if (u.status === "current") return <span className="font-bold text-accent">You are here</span>;
  return <span className="text-muted">Up next</span>;
}

export default function Page() {
  // Refetch on focus so a word that just became known in the tutor shows up when you come back.
  const { data, error, loading, reload } = useFetch("/api/progress", ProgressResponse, { refetchOnFocus: true });
  const current = data?.units.find((u) => u.id === data.currentUnitId);
  const doneCount = data?.units.filter((u) => u.status === "done").length ?? 0;

  return (
    <>
      <PageHeader
        kicker="Your course"
        title={data ? `${data.levelTitle} track` : "Your course"}
        subtitle="Lumo teaches one unit at a time. A unit is finished when you have said most of its words correctly and passed its check."
      />

      {loading && <div role="status" aria-label="Loading" className="h-40 animate-pulse rounded-sm bg-line" />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && data.units.length === 0 && <EmptyState>No course for this level yet.</EmptyState>}

      {data && data.units.length > 0 && (
        <div className="grid gap-10 md:grid-cols-[1fr_1.1fr]">
          <section aria-label="Units">
            <h2 className="text-xl font-extrabold">
              {doneCount} of {data.units.length} units done
            </h2>
            <ol className="mt-4 space-y-3">
              {data.units.map((u) => (
                <li
                  key={u.id}
                  aria-current={u.status === "current" ? "step" : undefined}
                  className={`rounded-sm border px-4 py-3 ${u.status === "current" ? "border-accent bg-panel" : "border-line"}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-lg font-bold ${u.status === "locked" ? "text-muted" : "text-ink"}`}>
                      {u.order === 0 ? "First words" : `Unit ${u.order} · ${u.title}`}
                    </p>
                    <Status u={u} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{u.canDo}</p>
                </li>
              ))}
            </ol>
          </section>

          {current && (
            <section aria-label="Current unit" className="rounded-sm border border-line bg-panel px-5 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-accent">Right now</p>
              <h2 className="mt-1 text-2xl font-extrabold">{current.title}</h2>
              <p className="mt-1 text-muted">{current.canDo}</p>

              <h3 className="mt-5 font-bold">Grammar idea</h3>
              <p className="text-muted">{current.concept}</p>

              <h3 className="mt-5 font-bold">
                Words{" "}
                <span className="font-normal text-muted">
                  {current.wordsKnown} of {current.wordsTotal} said correctly
                </span>
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {current.words.map((w) => (
                  <li key={w.lemma} className={`rounded-sm border px-3 py-1 ${STATE_LOOK[w.state] ?? STATE_LOOK.new}`}>
                    {w.lemma}
                    <span className="sr-only"> ({w.state})</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 font-bold">Check</h3>
              <p className="text-muted">
                {current.checkpointPassed ? "Passed." : "Not passed yet. Talk to Lumo without slipping on this unit's grammar idea."}
              </p>

              {data.lastLesson && data.lastLesson.unitId === current.id && (
                <>
                  <h3 className="mt-5 font-bold">Last time</h3>
                  <p className="text-muted">{data.lastLesson.summary_en}</p>
                  <h3 className="mt-3 font-bold">Next</h3>
                  <p className="text-muted">{data.lastLesson.nextStep_en}</p>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
