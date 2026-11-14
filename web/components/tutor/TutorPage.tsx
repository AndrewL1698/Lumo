"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TutorSession } from "@/app/tutor/session";
import { btn } from "@/components/ui/PageHeader";
import { CorrectionCards } from "./CorrectionCards";
import { KnownToast } from "./KnownToast";
import { PushToTalk } from "./PushToTalk";
import { RecapPanel } from "./RecapPanel";
import { TargetChips } from "./TargetChips";
import { TranscriptView } from "./TranscriptView";
import { newlyKnown } from "./wordUpdates";
import { visibleErrors } from "./highlight";
import { LuciFirefly, sparkToJar, type LuciReaction } from "./LuciFirefly";
import { rememberLearned } from "@/components/vocab/justLearned";

const speaker = "font-mono text-xs uppercase tracking-wider pt-2";

// Pure view over a TutorSession. Pass useMockTutorSession() or Andrew's real useTutorSession().
export function TutorPage({ session }: { session: TutorSession }) {
  const { status, partial, turns, targetWords, recap, notice, start, pressTalk, releaseTalk, sendText, end } = session;
  const [toasts, setToasts] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [typingOpen, setTypingOpen] = useState(true);
  const typeBox = useRef<HTMLDetailsElement>(null);
  const typeInput = useRef<HTMLInputElement>(null);

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
  }, [scrollKey]);

  // Whenever the tutor is waiting on the learner, open the type box and put the cursor in it (saves two clicks).
  // Space on the empty box still means push-to-talk (see PushToTalk).
  const awaitingReply = begun && status === "idle" && !!last?.tutorText;
  useEffect(() => {
    if (!awaitingReply) return;
    if (typeBox.current) typeBox.current.open = true;
    typeInput.current?.focus({ preventScroll: true });
  }, [awaitingReply, turns.length]);

  // Luci reacts once to each checked answer: a hop for a clean sentence, a gentle tilt for mistakes,
  // and a loop (plus a spark to "Your jar") when a word becomes known. View-only; no session data changes.
  const [reaction, setReaction] = useState<{ kind: LuciReaction; n: number }>({ kind: null, n: 0 });
  const reacted = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of turns) {
      if (!t.rawText || !t.correction || reacted.current.has(t.id)) continue;
      reacted.current.add(t.id);
      const learned = newlyKnown(t.wordUpdates).length > 0;
      const clean = visibleErrors(t.rawText, t.correction).length === 0;
      setReaction((r) => ({ kind: learned ? "loop" : clean ? "good" : "oops", n: r.n + 1 }));
      if (learned) setTimeout(sparkToJar, 350);
    }
  }, [turns]);
  useEffect(() => {
    if (!reaction.kind) return;
    const t = setTimeout(() => setReaction((r) => ({ ...r, kind: null })), 1700);
    return () => clearTimeout(t);
  }, [reaction]);
  const liveTutorTurn = useMemo(() => [...turns].reverse().find((t) => t.tutorText)?.id, [turns]);

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
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-accent">Night session</p>
        <h1 className="text-4xl font-extrabold tracking-tight">Talk about what you read</h1>
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
    <div className="mx-auto max-w-4xl space-y-6">
      {notice && (
        <p role="status" className="rounded-sm border border-sun-line bg-sun px-4 py-3 text-ink">
          {notice}
        </p>
      )}

      <TargetChips words={targetWords} known={known} />

      <ol className="divide-y divide-line">
        {turns.map((t, i) => (
          <li key={t.id} className="space-y-6 py-6 first:pt-2">
            {t.rawText && (
              <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:gap-4">
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
              <div
                className={`flex gap-3 sm:gap-5 ${t.id === liveTutorTurn ? "items-center" : "items-start"}`}
                data-luci-live={t.id === liveTutorTurn ? "" : undefined}
              >
                {t.id === liveTutorTurn ? (
                  // The live Luci is the focal point: ~240px on desktop, smaller on phones.
                  <div className="flex w-24 shrink-0 justify-center py-4 sm:w-44 lg:w-60">
                    <LuciFirefly
                      mood={status}
                      speechText={t.tutorText}
                      reaction={reaction.kind}
                      reactionKey={reaction.n}
                      className="h-24 w-24 sm:h-44 sm:w-44 lg:h-60 lg:w-60"
                    />
                  </div>
                ) : (
                  <div className="flex w-16 shrink-0 justify-center pt-1 sm:w-24">
                    <LuciFirefly still size={52} />
                  </div>
                )}
                <div
                  className={`relative min-w-0 flex-1 rounded-md border border-sun-line bg-sun px-4 py-3 sm:px-5 sm:py-4 before:absolute before:-left-[7px] before:h-3 before:w-3 before:rotate-45 before:border-b before:border-l before:border-sun-line before:bg-sun ${
                    t.id === liveTutorTurn ? "before:top-[calc(50%-6px)]" : "before:top-6"
                  }`}
                >
                  <p className="sr-only">Tutor</p>
                  <p className="relative text-xl leading-snug text-ink sm:text-2xl">{t.tutorText}</p>
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
        <div className="grid gap-2 border-t border-line pt-6 sm:grid-cols-[6rem_1fr] sm:gap-4">
          <p className={`${speaker} text-accent`}>You</p>
          <p className="text-2xl text-muted">{partial || "Listening"}</p>
        </div>
      )}

      {/* Controls stay pinned to the bottom of the screen so the demo never needs scrolling. */}
      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-panel px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <PushToTalk status={status} onPress={pressTalk} onRelease={releaseTalk} />
          <button type="button" onClick={() => void end()} disabled={turns.length < 2} className={btn.secondary}>
            End session
          </button>
        </div>

        <details ref={typeBox} open className="text-muted" onToggle={(e) => setTypingOpen(e.currentTarget.open)}>
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
              ref={typeInput}
              data-ptt-space
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Escribe en español"
              aria-label="Your answer in Spanish"
              className="min-w-0 flex-1 rounded-sm border border-line bg-panel px-3 py-2 text-ink placeholder:text-muted focus:border-muted focus:outline-none"
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
