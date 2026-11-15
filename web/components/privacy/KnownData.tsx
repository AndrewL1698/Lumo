"use client";
import { useState, type ReactNode } from "react";
import type { DataDeleteRequest, DataResponse } from "@parrot/shared";
import { btn } from "@/components/ui/PageHeader";

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

// Word state as a glow: dim (seen), medium (learning), bright (known / mastered). Same lights as the jar.
type Glow = "seen" | "learning" | "known";
const GLOW: Record<string, Glow> = { new: "seen", seen: "seen", learning: "learning", known: "known", known_assumed: "known", mastered: "known" };
const GLOW_NAME: Record<Glow, string> = { seen: "Seen", learning: "Learning", known: "Known" };

// Words page sections (D-010). "Seen" only appears when the extension has shown words not yet looked up.
const WORD_GROUPS: { title: string; blurb: string; states: string[]; optional?: boolean }[] = [
  { title: "Learning", blurb: "looked up or still shaky", states: ["learning"] },
  { title: "Known", blurb: "used correctly or passed", states: ["known", "known_assumed"] },
  { title: "Mastered", blurb: "solid for months", states: ["mastered"] },
  { title: "Seen", blurb: "spotted on a page, not looked up yet", states: ["new", "seen"], optional: true },
];

function GlowDot({ glow, size = "h-6 w-6" }: { glow: Glow; size?: string }) {
  return (
    <span className={`jar-legend grid shrink-0 place-items-center rounded-full bg-jar ${size}`} data-level={glow} aria-hidden="true">
      <span className="jar-light" />
    </span>
  );
}

// Drawn trash can (no icon library). The button carries the words for screen readers.
function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h13M8 5.5V3.8h4v1.7M5.2 5.5l.8 11h8l.8-11M8.6 8.5v5.5M11.4 8.5v5.5" />
    </svg>
  );
}

// Shows on hover or keyboard focus of its row; always visible on touch screens (no hover there).
function DeleteButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-muted opacity-0 transition-[opacity,color] duration-150 hover:text-stop focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-30 [@media(hover:none)]:opacity-100"
    >
      <TrashIcon />
    </button>
  );
}

function Heading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <h2 className="mb-5 font-display text-2xl font-extrabold">
      {children} <span className="font-sans text-lg font-normal text-muted">{count}</span>
    </h2>
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
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  return (
    <div className="space-y-16">
      <div className="max-w-3xl">
        <p className="font-display text-3xl font-extrabold leading-snug tracking-tight">
          Luci knows {n(data.words.length, "word", "words")}, {n(data.events.length, "moment", "moments")} of activity and{" "}
          {n(data.articles.length, "article", "articles")}.
        </p>
        <p className="mt-4 text-lg text-muted">
          That is the words you look up and practise, a short log of those actions, the title and website of articles you
          read, and your tutor conversations. It never stores full page text or what you type on other sites.
        </p>
      </div>

      {failed && (
        <p role="alert" className="text-lg font-semibold text-stop">
          That did not work. Nothing was removed. Try again.
        </p>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading count={data.words.length}>Words</Heading>
          <ul className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-muted" aria-label="What the glow means">
            {(["seen", "learning", "known"] as const).map((g) => (
              <li key={g} className="flex items-center gap-2">
                <GlowDot glow={g} size="h-5 w-5" />
                {GLOW_NAME[g]}
              </li>
            ))}
          </ul>
        </div>
        {data.words.length === 0 ? (
          <p className="text-muted">No words stored yet.</p>
        ) : (
          // Grouped by how well the learner knows them (D-010): the path a word takes, learning → known → mastered.
          <div className="space-y-8">
            {WORD_GROUPS.map((g) => {
              const words = data.words.filter((w) => g.states.includes(w.state)).sort((a, b) => a.lemma.localeCompare(b.lemma, "es"));
              if (g.optional && words.length === 0) return null;
              return (
                <div key={g.title}>
                  <h3 className="mb-3 flex items-baseline gap-2 font-display text-lg font-bold">
                    {g.title} <span className="font-sans text-base font-normal text-muted">{words.length}</span>
                    <span className="font-sans text-sm font-normal text-muted">· {g.blurb}</span>
                  </h3>
                  {words.length === 0 ? (
                    <p className="text-muted">None yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-x-2 gap-y-2">
                      {words.map((w) => {
                        const glow = GLOW[w.state] ?? "seen";
                        return (
                          <li
                            key={w.lemma}
                            className="group flex items-center gap-2 rounded-full py-1 pl-1.5 pr-1 transition-colors duration-150 hover:bg-line/60 focus-within:bg-line/60"
                            title={w.lastHoverAt ? `Last looked up ${fmt(w.lastHoverAt)}` : undefined}
                          >
                            <GlowDot glow={glow} />
                            <span className="text-lg font-bold">{w.lemma}</span>
                            <span className="sr-only">, {g.title}</span>
                            <DeleteButton label={w.lemma} busy={busy} onClick={() => void run({ kind: "word", lemma: w.lemma })} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-16 lg:grid-cols-[3fr_2fr]">
        <section>
          <Heading count={data.events.length}>Activity</Heading>
          {data.events.length === 0 ? (
            <p className="text-muted">No activity stored yet.</p>
          ) : (
            // A timeline: one line, one small light per moment.
            <ol className="relative ml-1.5 border-l-2 border-line">
              {data.events.map((e) => (
                <li key={e.id} className="group relative flex items-center justify-between gap-3 py-2 pl-6">
                  <span className="absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-ink">{EVENT_LABEL[e.type] ?? e.type}</span>
                    {e.lemma && <span className="ml-2 font-bold">{e.lemma}</span>}
                    <span className="ml-3 text-sm text-muted">{fmt(e.ts)}</span>
                  </span>
                  <DeleteButton label={`${EVENT_LABEL[e.type] ?? e.type} entry`} busy={busy} onClick={() => void run({ kind: "event", id: e.id })} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <Heading count={data.articles.length}>Articles</Heading>
          {data.articles.length === 0 ? (
            <p className="text-muted">No articles stored yet.</p>
          ) : (
            <ul className="space-y-5">
              {data.articles.map((a) => (
                <li key={a.id} className="group flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-display text-xl font-semibold leading-snug">{a.title}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {a.domain}, {fmt(a.ts)}
                    </span>
                  </span>
                  <DeleteButton label={a.title} busy={busy} onClick={() => void run({ kind: "article", id: a.id })} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="border-t border-line pt-8">
        {!confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted">Start over: remove everything Luci has stored. Your settings are kept.</p>
            <button type="button" disabled={busy || total === 0} onClick={() => setConfirming(true)} className={btn.danger}>
              Delete everything
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="max-w-2xl text-lg text-ink">
              This deletes every word Luci has tracked, your activity, the articles you&apos;ve read, and your tutor sessions and
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
      </section>
    </div>
  );
}
