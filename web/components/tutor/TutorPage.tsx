"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TutorSession } from "@/app/tutor/session";
import { CorrectionCards } from "./CorrectionCards";
import { KnownToast } from "./KnownToast";
import { PushToTalk } from "./PushToTalk";
import { RecapPanel } from "./RecapPanel";
import { TargetChips } from "./TargetChips";
import { TranscriptView } from "./TranscriptView";
import { newlyKnown } from "./wordUpdates";

// Pure view over a TutorSession. Pass useMockTutorSession() or Andrew's real useTutorSession().
export function TutorPage({ session }: { session: TutorSession }) {
  const { status, partial, turns, targetWords, recap, start, pressTalk, releaseTalk, end } = session;
  const [toasts, setToasts] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    void start();
  }, [start]);

  // Queue a toast for each word that just flipped to "known" (once per turn).
  useEffect(() => {
    const fresh: string[] = [];
    const nextSeen = new Set(seen);
    for (const t of turns) {
      if (nextSeen.has(t.id) || !t.wordUpdates) continue;
      nextSeen.add(t.id);
      fresh.push(...newlyKnown(t.wordUpdates));
    }
    if (fresh.length) {
      setSeen(nextSeen);
      setToasts((q) => [...q, ...fresh]);
    }
  }, [turns, seen]);

  const known = useMemo(() => turns.flatMap((t) => newlyKnown(t.wordUpdates)), [turns]);
  const dismissToast = useCallback(() => setToasts((q) => q.slice(1)), []);

  if (recap) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <RecapPanel recap={recap} onClose={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <TargetChips words={targetWords} known={known} />

      <ol className="space-y-6">
        {turns.map((t) => (
          <li key={t.id} className="space-y-3">
            {t.rawText && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">You said</p>
                <TranscriptView raw={t.rawText} result={t.correction} />
                {!t.correction && <p className="mt-2 text-sm text-slate-500">Checking…</p>}
              </div>
            )}
            <CorrectionCards raw={t.rawText} result={t.correction} />
            {t.tutorText && (
              <div className="rounded-xl bg-indigo-50 p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-indigo-600">Tutor</p>
                <p className="text-xl text-slate-900">{t.tutorText}</p>
              </div>
            )}
          </li>
        ))}
      </ol>

      {status === "listening" && (
        <p className="rounded-xl border border-dashed border-red-300 p-4 text-xl text-slate-800">
          {partial || "…"}
        </p>
      )}

      <div className="flex items-center justify-between">
        <PushToTalk status={status} onPress={pressTalk} onRelease={releaseTalk} />
        <button
          type="button"
          onClick={() => void end()}
          disabled={turns.length < 2}
          className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          End session
        </button>
      </div>

      <KnownToast lemma={toasts[0] ?? null} onDone={dismissToast} />
    </div>
  );
}
