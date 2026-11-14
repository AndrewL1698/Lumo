"use client";
import { useState, type ReactNode } from "react";
import type { DataDeleteRequest, DataResponse } from "@parrot/shared";
import { EmptyState } from "@/components/ui/PageHeader";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const EVENT_LABEL: Record<string, string> = {
  hover: "Looked up a word",
  spoken_correct: "Used a word correctly in speech",
  spoken_incorrect: "Used a word incorrectly in speech",
};

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-bold text-slate-900">
        {title} <span className="text-base font-normal text-slate-500">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function Row({ children, onDelete, busy, label }: { children: ReactNode; onDelete: () => void; busy: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">{children}</div>
      <button
        type="button"
        disabled={busy}
        aria-label={`Delete ${label}`}
        onClick={onDelete}
        className="shrink-0 rounded-lg border border-red-200 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>
    </li>
  );
}

// `onDelete` resolves true when the server accepted the delete; the page then updates its local list.
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
      <p className="mb-6 rounded-xl bg-indigo-50 p-4 text-slate-700">
        Parrot stores the words you look up and practice, a short log of those actions, the title and website of articles you read, and your tutor conversations (what you said, plus the corrections).
        It never stores full page text or what you type on other sites.
      </p>

      {failed && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          That didn't work. Nothing was removed, so please try again.
        </p>
      )}

      <Section title="Words" count={data.words.length}>
        {data.words.length === 0 ? (
          <EmptyState>No words stored yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.words.map((w) => (
              <Row key={w.lemma} busy={busy} label={w.lemma} onDelete={() => void run({ kind: "word", lemma: w.lemma })}>
                <span className="font-semibold text-slate-900">{w.lemma}</span>
                <span className="ml-2 text-sm text-slate-500">
                  {w.state} · seen {w.seenCount}×{w.lastHoverAt ? ` · last looked up ${fmt(w.lastHoverAt)}` : ""}
                </span>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activity log" count={data.events.length}>
        {data.events.length === 0 ? (
          <EmptyState>No activity stored yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.events.map((e) => (
              <Row key={e.id} busy={busy} label={`${e.type} event`} onDelete={() => void run({ kind: "event", id: e.id })}>
                <span className="text-slate-900">{EVENT_LABEL[e.type] ?? e.type}</span>
                {e.lemma && <span className="ml-2 font-semibold text-slate-900">{e.lemma}</span>}
                <span className="ml-2 text-sm text-slate-500">{fmt(e.ts)}</span>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Articles" count={data.articles.length}>
        {data.articles.length === 0 ? (
          <EmptyState>No articles stored yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.articles.map((a) => (
              <Row key={a.id} busy={busy} label={a.title} onDelete={() => void run({ kind: "article", id: a.id })}>
                <span className="text-slate-900">{a.title}</span>
                <span className="ml-2 text-sm text-slate-500">
                  {a.domain} · {fmt(a.ts)}
                </span>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        {!confirming ? (
          <button
            type="button"
            disabled={busy || total === 0}
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Delete everything
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium text-red-900">This deletes every word Parrot has tracked, your activity, the articles you've read, and your tutor sessions and transcripts. Your settings are kept. This can't be undone. Continue?</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run({ kind: "all" })}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Yes, delete everything
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
