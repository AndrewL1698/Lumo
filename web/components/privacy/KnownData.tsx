"use client";
import { useState, type ReactNode } from "react";
import type { DataDeleteRequest, DataResponse } from "@parrot/shared";
import { btn, EmptyState } from "@/components/ui/PageHeader";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Plain-English names for every LearnerEventType (shared/src/events.ts).
const EVENT_LABEL: Record<string, string> = {
  seen: "Saw a swapped word",
  hover: "Looked up a word",
  knew_it: "Marked a word as known",
  didnt_know: "Marked a word as new",
  quiz_pass: "Got a quiz right",
  quiz_fail: "Missed a quiz",
  reading: "Read an article",
  spoken_correct: "Used a word correctly in speech",
  spoken_incorrect: "Used a word incorrectly in speech",
};

const STATE_TONE: Record<string, string> = { learning: "text-wait", known: "text-go", mastered: "text-ink" };

const deleteLink =
  "shrink-0 font-mono text-xs uppercase tracking-wider text-muted transition-colors duration-150 hover:text-stop disabled:opacity-40";

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-baseline gap-3 border-b border-line pb-3">
        <span className="text-xl font-bold text-ink">{title}</span>
        <span className="font-mono text-muted">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Row({ children, onDelete, busy, label }: { children: ReactNode; onDelete: () => void; busy: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line py-3">
      <div className="min-w-0">{children}</div>
      <button type="button" disabled={busy} aria-label={`Delete ${label}`} onClick={onDelete} className={deleteLink}>
        Delete
      </button>
    </li>
  );
}

// `onDelete` resolves true when the server accepted the delete; the page then refetches.
export function KnownData({ data, onDelete }: { data: DataResponse; onDelete: (req: DataDeleteRequest) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(req: DataDeleteRequest) {
    setBusy(true);
    setFailed(!(await onDelete(req)));
    setBusy(false);
    setConfirming(false);
  }

  const total = data.words.length + data.events.length + data.articles.length;

  return (
    <div>
      <p className="mb-8 max-w-3xl text-lg text-ink">
        Parrot stores the words you look up and practise, a short log of those actions, the title and website of articles
        you read, and your tutor conversations (what you said, plus the corrections).{" "}
        <span className="text-muted">It never stores full page text or what you type on other sites.</span>
      </p>

      <p className="mb-10 font-mono text-muted">
        <span className="text-ink">{data.words.length}</span> words, <span className="text-ink">{data.events.length}</span> activity{" "}
        {data.events.length === 1 ? "entry" : "entries"}, <span className="text-ink">{data.articles.length}</span>{" "}
        {data.articles.length === 1 ? "article" : "articles"}
      </p>

      {failed && (
        <p role="alert" className="mb-6 rounded-sm border border-stop/60 px-4 py-3 text-ink">
          That did not work. Nothing was removed. Try again.
        </p>
      )}

      <Section title="Words" count={data.words.length}>
        {data.words.length === 0 ? (
          <EmptyState>No words stored yet.</EmptyState>
        ) : (
          // A dense grid so words, activity and articles fit in one glance during the demo.
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {data.words.map((w) => (
              <li
                key={w.lemma}
                title={w.lastHoverAt ? `Last looked up ${fmt(w.lastHoverAt)}` : undefined}
                className="flex items-baseline justify-between gap-3 border-b border-line py-2"
              >
                <span>
                  <span className="font-bold text-ink">{w.lemma}</span>
                  <span className={`ml-2 font-mono text-xs ${STATE_TONE[w.state] ?? "text-muted"}`}>{w.state}</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Delete ${w.lemma}`}
                  onClick={() => void run({ kind: "word", lemma: w.lemma })}
                  className={deleteLink}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activity log" count={data.events.length}>
        {data.events.length === 0 ? (
          <EmptyState>No activity stored yet.</EmptyState>
        ) : (
          <ul>
            {data.events.map((e) => (
              <Row key={e.id} busy={busy} label={`${EVENT_LABEL[e.type] ?? e.type} entry`} onDelete={() => void run({ kind: "event", id: e.id })}>
                <span className="mr-4 font-mono text-sm text-muted">{fmt(e.ts)}</span>
                <span className="text-ink">{EVENT_LABEL[e.type] ?? e.type}</span>
                {e.lemma && <span className="ml-2 font-bold text-ink">{e.lemma}</span>}
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Articles" count={data.articles.length}>
        {data.articles.length === 0 ? (
          <EmptyState>No articles stored yet.</EmptyState>
        ) : (
          <ul>
            {data.articles.map((a) => (
              <Row key={a.id} busy={busy} label={a.title} onDelete={() => void run({ kind: "article", id: a.id })}>
                <span className="text-ink">{a.title}</span>
                <span className="ml-3 font-mono text-sm text-muted">
                  {a.domain} {fmt(a.ts)}
                </span>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <div className="rounded-sm border border-line px-5 py-5">
        {!confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted">Remove everything Parrot has stored. Your settings are kept.</p>
            <button type="button" disabled={busy || total === 0} onClick={() => setConfirming(true)} className={btn.danger}>
              Delete everything
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-ink">
              This deletes every word Parrot has tracked, your activity, the articles you&apos;ve read, and your tutor sessions and
              transcripts. Your settings are kept. This can&apos;t be undone.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => void run({ kind: "all" })} className={btn.dangerSolid}>
                Yes, delete everything
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={btn.secondary}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
