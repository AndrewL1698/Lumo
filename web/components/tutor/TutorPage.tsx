"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TutorSession } from "@/app/tutor/session";
import { btn } from "@/components/ui/PageHeader";
import { CorrectionCards } from "./CorrectionCards";
import { KnownToast } from "./KnownToast";
import { PushToTalk } from "./PushToTalk";
import { RecapPanel } from "./RecapPanel";
import { TargetChips } from "./TargetChips";
import { TranscriptView } from "./TranscriptView";
import { newlyKnown } from "./wordUpdates";
import { rememberLearned } from "@/components/vocab/justLearned";

const speaker = "font-mono text-xs uppercase tracking-wider pt-2";

// Pure view over a TutorSession. Pass useMockTutorSession() or Andrew's real useTutorSession().
export function TutorPage({ session }: { session: TutorSession }) {
  const { status, partial, turns, targetWords, recap, notice, start, pressTalk, releaseTalk, sendText, end } = session;
  const [toasts, setToasts] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [typingOpen, setTypingOpen] = useState(false);

  // Browsers only allow mic access and audio playback after a click, so the session starts from a button.
  const [begun, setBegun] = useState(false);

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
      rememberLearned(fresh); // so the Vocabulary page can highlight these
      setSeen(nextSeen);
      setToasts((q) => [...q, ...fresh]);
    }
  }, [turns, seen]);

  // Keep the newest message in view as turns, corrections and captions arrive.
  const last = turns[turns.length - 1];
  const scrollKey = `${turns.length}|${status}|${last?.correction ? 1 : 0}|${last?.tutorText?.length ?? 0}|${partial.length}`;
  useEffect(() => {
    if (turns.length < 2 && status !== "listening") return; // nothing to scroll to yet
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [scrollKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const known = useMemo(() => turns.flatMap((t) => newlyKnown(t.wordUpdates)), [turns]);
  const dismissToast = useCallback(() => setToasts((q) => q.slice(1)), []);

  if (recap) {
    return (
      <div className="mx-auto max-w-3xl">
        <RecapPanel recap={recap} onClose={() => window.location.reload()} />
      </div>
    );
  }

  if (!begun) {
    return (
      <div className="mx-auto max-w-3xl border-b border-line pb-10">
        <h1 className="text-3xl font-bold tracking-tight">Talk about what you read</h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          The tutor opens a short Spanish conversation about your reading today. Hold Space or the button to answer. Each
          mistake is marked in your own words, with the fix above it and an English reason below.
        </p>
        <button
          type="button"
          onClick={() => {
            setBegun(true);
            void start();
          }}
          className={`${btn.primary} mt-8 h-14 px-8 text-lg`}
        >
          Start lesson
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {notice && (
        <p role="status" className="rounded-sm border border-wait/70 px-4 py-3 text-ink">
          {notice}
        </p>
      )}

      <TargetChips words={targetWords} known={known} />

      <ol className="divide-y divide-line">
        {turns.map((t, i) => (
          <li key={t.id} className="space-y-6 py-6 first:pt-2">
            {t.rawText && (
              <div className="grid gap-2 sm:grid-cols-[5rem_1fr] sm:gap-4">
                <p className={`${speaker} text-muted`}>You</p>
                <div className="space-y-3">
                  <TranscriptView raw={t.rawText} result={t.correction} />
                  {!t.correction && <p className="font-mono text-sm text-muted">Checking</p>}
                  {t.correctionFailed && <p className="text-muted">This answer could not be checked. It was still received.</p>}
                  <CorrectionCards raw={t.rawText} result={t.correction} />
                </div>
              </div>
            )}
            {t.tutorText && (
              <div className="grid gap-2 sm:grid-cols-[5rem_1fr] sm:gap-4">
                <p className={`${speaker} text-ink`}>Tutor</p>
                <div>
                  <p className="text-2xl leading-snug text-ink">{t.tutorText}</p>
                  {t.tutorEnglish &&
                    (turns.slice(i + 1).some((x) => x.rawText) ? (
                      <p className="mt-3 text-lg text-muted">
                        <span className="mr-2 font-mono text-xs uppercase tracking-wider">English</span>
                        {t.tutorEnglish}
                      </p>
                    ) : (
                      <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted">English shows after you answer</p>
                    ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      {status === "listening" && (
        <div className="grid gap-2 border-t border-line pt-6 sm:grid-cols-[5rem_1fr] sm:gap-4">
          <p className={`${speaker} text-wait`}>You</p>
          <p className="text-2xl text-muted">{partial || "Listening"}</p>
        </div>
      )}

      {/* Controls stay pinned to the bottom of the screen so the demo never needs scrolling. */}
      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-bg px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <PushToTalk status={status} onPress={pressTalk} onRelease={releaseTalk} />
          <button type="button" onClick={() => void end()} disabled={turns.length < 2} className={btn.secondary}>
            End session
          </button>
        </div>

        <details className="text-muted" onToggle={(e) => setTypingOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer list-none text-sm transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
            {typingOpen ? "Hide typing" : "Type your answer instead"}
          </summary>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = typed.trim();
              if (!text) return;
              sendText(text);
              setTyped("");
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Escribe en español"
              aria-label="Your answer in Spanish"
              className="min-w-0 flex-1 rounded-sm border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted focus:border-muted focus:outline-none"
            />
            <button type="submit" className={btn.primary}>
              Send
            </button>
          </form>
        </details>
      </div>

      <KnownToast lemma={toasts[0] ?? null} onDone={dismissToast} />
    </div>
  );
}
