"use client";

// Bare developer test page for the voice tutor (voice-plan §1.7, §1.8, Verification step 4).
// Renders exactly what useTutorSession returns. The learner's raw text is never altered here.
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CorrectionError, Recap, TurnTimeline } from "@parrot/shared";
import { useTutorSession } from "@/lib/tutor/client/useTutorSession";
import type { Turn, TutorStatus, UseTutorSession } from "@/lib/tutor/types";

const btn = "rounded border border-gray-400 px-3 py-1 text-sm disabled:opacity-40";

const STATUS_CLASS: Record<TutorStatus, string> = {
  idle: "bg-gray-200 text-gray-800",
  listening: "bg-red-600 text-white",
  checking: "bg-amber-400 text-black",
  speaking: "bg-green-600 text-white",
};

/** Split rawText into plain and highlighted pieces. Spans are located with indexOf; text is never changed. */
function highlight(rawText: string, errors: CorrectionError[]): ReactNode[] {
  const ranges: { start: number; end: number; title: string }[] = [];
  for (const e of errors) {
    if (!e.span) continue;
    let at = rawText.indexOf(e.span);
    // If that occurrence is already taken by another error, try the next one.
    while (at !== -1 && ranges.some((r) => at < r.end && at + e.span.length > r.start)) {
      at = rawText.indexOf(e.span, at + 1);
    }
    if (at === -1) continue; // span not found: skip the highlight
    ranges.push({ start: at, end: at + e.span.length, title: `${e.correction} (${e.type})` });
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) out.push(rawText.slice(pos, r.start));
    out.push(
      <mark key={r.start} className="rounded bg-red-200 px-0.5 text-red-900" title={r.title}>
        {rawText.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  }
  if (pos < rawText.length) out.push(rawText.slice(pos));
  return out;
}

function TurnView({ turn }: { turn: Turn }) {
  const c = turn.correction;
  return (
    <li className="space-y-1 rounded border border-gray-300 p-3">
      {turn.rawText !== "" && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600">
            You said
            {turn.sttPath && <span className="ml-2 rounded border border-gray-400 px-1">{turn.sttPath}</span>}
          </p>
          <p className="whitespace-pre-wrap text-lg" lang="es">
            {highlight(turn.rawText, c && !turn.correctionFailed ? c.errors : [])}
          </p>
          {turn.correctionFailed ? (
            <p className="text-sm text-gray-600">(correction unavailable)</p>
          ) : !c ? (
            <p className="text-sm text-gray-600">checking…</p>
          ) : (
            <>
              {c.errors.length > 0 && (
                <ul className="space-y-0.5 text-sm">
                  {c.errors.map((e, i) => (
                    <li key={i}>
                      <span className="text-red-700" lang="es">
                        {e.span}
                      </span>{" "}
                      →{" "}
                      <span className="font-semibold text-green-700" lang="es">
                        {e.correction}
                      </span>{" "}
                      · {e.explanation_en} <span className="rounded bg-gray-200 px-1 text-xs">{e.type}</span>
                    </li>
                  ))}
                </ul>
              )}
              {c.flag && (
                <p className="text-sm text-amber-700">
                  flag: {c.flag}
                  {c.spanish_version && <span lang="es"> · in Spanish: {c.spanish_version}</span>}
                </p>
              )}
              {c.overall_ok && <p className="text-sm text-green-700">✓ no errors</p>}
            </>
          )}
          {turn.wordUpdates && turn.wordUpdates.length > 0 && (
            <ul className="text-sm text-blue-800">
              {turn.wordUpdates.map((w, i) => (
                <li key={i}>
                  {w.lemma}: {w.from} → {w.to}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {turn.tutorText && (
        <div>
          <p className="text-xs text-gray-600">Tutor</p>
          <p className="whitespace-pre-wrap" lang="es">
            {turn.tutorText}
          </p>
          {turn.tutorEnglish && <p className="text-sm text-gray-600">{turn.tutorEnglish}</p>}
        </div>
      )}
    </li>
  );
}

function RecapView({ recap }: { recap: Recap }) {
  return (
    <section className="space-y-2 rounded border-2 border-gray-800 p-4">
      <h2 className="text-lg font-semibold">Recap</h2>
      <p>{recap.summary_en}</p>
      <div>
        <h3 className="text-sm font-semibold">Top errors</h3>
        {recap.topErrors.length === 0 ? (
          <p className="text-sm text-gray-600">None.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {recap.topErrors.map((e, i) => (
              <li key={i}>
                <span className="text-red-700" lang="es">
                  {e.span}
                </span>{" "}
                →{" "}
                <span className="font-semibold text-green-700" lang="es">
                  {e.correction}
                </span>{" "}
                (×{e.count}, {e.type}) · {e.explanation_en}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Tips</h3>
        {recap.tips.length === 0 ? (
          <p className="text-sm text-gray-600">None.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {recap.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm">
        <span className="font-semibold">Words now known:</span> {recap.wordsNowKnown.join(", ") || "none"}
      </p>
      <p className="text-sm">
        <span className="font-semibold">Review tomorrow:</span> {recap.reviewTomorrow.join(", ") || "none"}
      </p>
    </section>
  );
}

function DebugPanel({ t }: { t: TurnTimeline | null }) {
  const since = (x: number | null) => (t && x !== null ? Math.round(x - t.tRelease) : null);
  const rows: { label: string; value: number | null; limit?: number }[] = t
    ? [
        { label: "hold", value: Math.round(t.tRelease - t.tPress) },
        { label: "release → STT final", value: since(t.tSttFinal) },
        { label: "release → correction shown", value: since(t.tCorrectionShown), limit: 1500 },
        { label: "release → reply first token", value: since(t.tReplyFirstToken) },
        { label: "release → first chunk", value: since(t.tFirstChunk) },
        { label: "release → audio start", value: since(t.tAudioStart), limit: 2000 },
      ]
    : [];
  return (
    <section className="space-y-2 rounded border border-dashed border-gray-500 p-3 font-mono text-sm">
      <h2 className="font-semibold">Debug: last turn timings</h2>
      {!t ? (
        <p>No completed turn yet.</p>
      ) : (
        <>
          <p>sttPath: {t.sttPath}</p>
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="pr-4">{r.label}</td>
                  <td
                    className={`text-right ${
                      r.value !== null && r.limit !== undefined && r.value > r.limit ? "font-bold text-red-600" : ""
                    }`}
                  >
                    {r.value === null ? "—" : `${r.value} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary className="cursor-pointer">Raw JSON</summary>
            <pre className="overflow-x-auto text-xs">{JSON.stringify(t, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}

const isField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export function TutorLab({ debug, forceBatch }: { debug: boolean; forceBatch: boolean }) {
  const session: UseTutorSession = useTutorSession({ forceBatch });
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [holding, setHolding] = useState(false);
  const [text, setText] = useState("");

  // Latest values for the window key listeners (registered once).
  const liveRef = useRef({ session, started });
  const heldRef = useRef(false);
  useEffect(() => {
    liveRef.current = { session, started };
  });

  function press() {
    if (!liveRef.current.started || heldRef.current) return;
    heldRef.current = true;
    setHolding(true);
    liveRef.current.session.pressTalk();
  }
  function release() {
    if (!heldRef.current) return; // pointerup then pointerleave: release once
    heldRef.current = false;
    setHolding(false);
    liveRef.current.session.releaseTalk();
  }
  const pressRef = useRef(press);
  const releaseRef = useRef(release);
  useEffect(() => {
    pressRef.current = press;
    releaseRef.current = release;
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isField(e.target)) return;
      e.preventDefault(); // no page scroll, no click on a focused button
      if (!e.repeat) pressRef.current();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isField(e.target)) return;
      e.preventDefault();
      releaseRef.current();
    };
    const onBlur = () => releaseRef.current(); // tab switch while holding: don't get stuck listening
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  async function onStart() {
    setStarting(true);
    try {
      await session.start();
      setStarted(true);
    } catch (err) {
      console.error("tutor-lab: start failed", err);
    } finally {
      setStarting(false);
    }
  }

  async function onEnd() {
    release();
    setEnding(true);
    try {
      await session.end();
    } catch (err) {
      console.error("tutor-lab: end failed", err);
    } finally {
      setEnding(false);
      setStarted(false);
    }
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !started) return;
    session.sendText(t);
    setText("");
  }

  const knownLemmas = new Set<string>();
  for (const turn of session.turns) {
    for (const w of turn.wordUpdates ?? []) if (w.to === "known") knownLemmas.add(w.lemma);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={`${btn} font-semibold`} onClick={onStart} disabled={started || starting}>
          {starting ? "Starting…" : "Start"}
        </button>
        <button className={btn} onClick={onEnd} disabled={!started || ending}>
          {ending ? "Ending…" : "End session"}
        </button>
        <span className={`rounded px-2 py-1 text-sm font-semibold ${STATUS_CLASS[session.status]}`}>status: {session.status}</span>
        {forceBatch && <span className="rounded border border-gray-400 px-2 py-1 text-xs">forceBatch on</span>}
      </div>

      {session.notice !== null && (
        <p role="status" className="rounded border border-amber-500 bg-amber-100 p-2 text-sm text-amber-900">
          {session.notice}
        </p>
      )}

      <div className="space-y-2">
        <button
          className={`w-full touch-none rounded px-6 py-8 text-xl font-bold text-white select-none disabled:opacity-40 ${
            holding ? "bg-red-600" : "bg-gray-800"
          }`}
          disabled={!started}
          onPointerDown={press}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
        >
          {holding ? "Listening… release to send" : "Hold to talk (or hold Space)"}
        </button>
        <p className="min-h-6 text-gray-700" lang="es">
          {session.partial ? <>… {session.partial}</> : null}
        </p>
      </div>

      <form className="flex gap-2" onSubmit={onSend}>
        <input
          className="flex-1 rounded border border-gray-400 px-2 py-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type in Spanish (no mic needed) and press Enter"
          lang="es"
          disabled={!started}
        />
        <button type="submit" className={btn} disabled={!started || text.trim() === ""}>
          Send
        </button>
      </form>

      {session.targetWords.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Target words:</span>
          {session.targetWords.map((w) => {
            const known = knownLemmas.has(w.lemma);
            return (
              <span
                key={w.lemma}
                className={`rounded-full border px-2 py-0.5 ${known ? "border-green-600 bg-green-100 text-green-900" : "border-gray-400"}`}
              >
                <span lang="es">{w.lemma}</span> · {w.english}
                {known && " ✓ known"}
              </span>
            );
          })}
        </div>
      )}

      {session.turns.length === 0 ? (
        <p className="text-sm text-gray-600">No turns yet. Press Start; the tutor speaks first.</p>
      ) : (
        <ol className="space-y-2">
          {session.turns.map((turn) => (
            <TurnView key={turn.id} turn={turn} />
          ))}
        </ol>
      )}

      {session.recap && <RecapView recap={session.recap} />}
      {debug && <DebugPanel t={session.lastTimeline} />}
    </div>
  );
}
