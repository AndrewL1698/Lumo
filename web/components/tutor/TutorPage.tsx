"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TutorSession, TutorTurn } from "@/app/tutor/session";
import { btn } from "@/components/ui/PageHeader";
import { CorrectionCards } from "./CorrectionCards";
import { KnownToast } from "./KnownToast";
import { HandsFreeMic } from "./HandsFreeMic";
import { ModeToggle } from "./ModeToggle";
import { PushToTalk } from "./PushToTalk";
import { RecapPanel } from "./RecapPanel";
import { TargetChips } from "./TargetChips";
import { TranscriptView } from "./TranscriptView";
import { newlyKnown } from "./wordUpdates";
import { visibleErrors } from "./highlight";
import { LuciFirefly, sparkToJar, type LuciReaction } from "./LuciFirefly";
import { LessonCard } from "./LessonCard";
import { rememberLearned } from "@/components/vocab/justLearned";

const speaker = "font-display text-base font-semibold pt-2";

// Pure view over a TutorSession. Pass useMockTutorSession() or Andrew's real useTutorSession().
export function TutorPage({ session }: { session: TutorSession }) {
  const { status, partial, turns, targetWords, recap, notice, start, pressTalk, releaseTalk, sendText, end } = session;
  const { mode = "ptt", setMode, muted = false, setMuted } = session;
  const handsFree = mode === "handsfree" && !!setMode;
  // Remember the choice on this browser. The default (and anything unreadable) is push-to-talk.
  useEffect(() => {
    try {
      if (setMode && localStorage.getItem("luci.talkMode") === "handsfree") setMode("handsfree");
    } catch {
      // storage blocked: stay on push-to-talk
    }
  }, []);
  const changeMode = (m: "ptt" | "handsfree") => {
    setMode?.(m);
    try {
      localStorage.setItem("luci.talkMode", m);
    } catch {
      // ignore
    }
  };
  const talkControl = handsFree ? (
    <HandsFreeMic status={status} muted={muted} onToggleMute={() => setMuted?.(!muted)} />
  ) : (
    <PushToTalk status={status} onPress={pressTalk} onRelease={releaseTalk} />
  );
  const plan = session.plan ?? null;
  // The lesson card starts open and folds away after your first answer (you can reopen it any time).
  const [lessonOpen, setLessonOpen] = useState(true);
  const answered = turns.some((t) => t.rawText);
  useEffect(() => {
    if (answered) setLessonOpen(false);
  }, [answered]);
  const [toasts, setToasts] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [typingOpen, setTypingOpen] = useState(true);
  const typeBox = useRef<HTMLDetailsElement>(null);
  const typeInput = useRef<HTMLInputElement>(null);

  // Browsers only allow mic access and audio playback after a click, so the session starts from a button.
  const [begun, setBegun] = useState(false);
  // Tutor lines whose English the learner chose to reveal before answering.
  const [shownEnglish, setShownEnglish] = useState<Set<string>>(new Set());
  // Between "End session" and the recap arriving: a recap-shaped placeholder. `notice` is remembered at the
  // click so a new notice afterwards means the recap failed (the hook reports it as a notice).
  const [ending, setEnding] = useState<{ notice: string | null } | null>(null);

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

  // The newest exchange is at the top. When a new one starts (you begin talking, or a new turn arrives),
  // bring the page back to the top if you had scrolled down. Only on those moments, never per character.
  const last = turns[turns.length - 1];
  const exchangeKey = `${turns.length}|${status === "listening" ? 1 : 0}`;
  useEffect(() => {
    if (turns.length < 2 && status !== "listening") return;
    if (window.scrollY < 24) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [exchangeKey]);

  // Wide screens: one Luci, pinned beside the conversation, never remounted. Narrow screens: Luci sits
  // beside the newest tutor message.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);

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
      const flagged = t.correction.flag === "english" || t.correction.flag === "unclear";
      const clean = !flagged && visibleErrors(t.rawText, t.correction).length === 0;
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

  if (ending) {
    const failed = !!notice && notice !== ending.notice;
    const bar = "animate-pulse rounded-xs bg-line";
    return (
      <div className="mx-auto max-w-3xl" role="status" aria-live="polite">
        <div className="flex items-center gap-5 border-b border-line pb-6">
          <LuciFirefly mood={failed ? "idle" : "checking"} className="h-20 w-20" />
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{failed ? "Couldn't load your recap" : "Writing your recap…"}</h2>
            <p className="mt-2 text-lg text-muted">
              {failed
                ? "Your progress from this session is already saved. You can start a new session any time."
                : "Luci is looking back over what you said."}
            </p>
          </div>
        </div>
        {failed ? (
          <button type="button" onClick={() => window.location.reload()} className={`${btn.primary} mt-8`}>
            Start a new session
          </button>
        ) : (
          // shaped like the recap: mistakes, tips, then the two word lists
          <div className="mt-8 space-y-8" aria-hidden="true">
            <div className="space-y-3">
              <div className={`${bar} h-5 w-44`} />
              <div className={`${bar} h-12 w-full`} />
              <div className={`${bar} h-12 w-5/6`} />
            </div>
            <div className="space-y-2">
              <div className={`${bar} h-5 w-20`} />
              <div className={`${bar} h-4 w-3/4`} />
            </div>
            <div className="grid gap-8 border-t border-line pt-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className={`${bar} h-5 w-48`} />
                <div className={`${bar} h-6 w-32`} />
              </div>
              <div className="space-y-2">
                <div className={`${bar} h-5 w-36`} />
                <div className={`${bar} h-6 w-28`} />
              </div>
            </div>
          </div>
        )}
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

  const liveText = turns.find((t) => t.id === liveTutorTurn)?.tutorText ?? "";

  // Exchanges, newest first: the newest at full size, the next two smaller and dimmer, the rest folded away.
  const newest = last;
  const older = turns
    .slice(0, -1)
    .map((t, i) => ({ t, i }))
    .reverse();
  const recent = older.slice(0, 2);
  const earlier = older.slice(2);

  const renderExchange = (t: TutorTurn, i: number, prominent: boolean) => {
    const isNewest = t.id === newest?.id;
    const pending = isNewest && !t.tutorText && (status === "checking" || status === "speaking");
    const luciHere = isNewest && !wide;
    return (
      <article
        key={t.id}
        className={`space-y-6 py-6 ${prominent || isNewest ? "exchange-newest" : "exchange-older"}`}
        aria-label={isNewest ? "Latest exchange" : undefined}
      >
        {t.rawText && (
          <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:gap-4">
            <p className={`${speaker} text-muted`}>You</p>
            <div className="space-y-3">
              <TranscriptView raw={t.rawText} result={t.correction} />
              {!t.correction && <p className="text-muted">Checking…</p>}
              {t.correctionFailed && <p className="text-muted">This answer could not be checked. It was still received.</p>}
              {!t.correctionFailed && <CorrectionCards raw={t.rawText} result={t.correction} />}
            </div>
          </div>
        )}
        {(t.tutorText || pending) && (
          <div className={`flex gap-3 sm:gap-5 ${luciHere ? "items-center" : "items-start"}`} data-luci-live={luciHere ? "" : undefined}>
            {wide ? null : luciHere ? (
              // Narrow screens: Luci sits beside the newest reply.
              <div className="flex w-24 shrink-0 justify-center py-4 sm:w-44">{luci("h-24 w-24 sm:h-44 sm:w-44")}</div>
            ) : (
              <div className="flex w-16 shrink-0 justify-center pt-1 sm:w-24">
                <LuciFirefly still size={44} />
              </div>
            )}
            <div
              className={`relative min-w-0 flex-1 rounded-md border border-sun-line bg-sun px-4 py-3 sm:px-5 sm:py-4 before:absolute before:-left-[7px] before:h-3 before:w-3 before:rotate-45 before:border-b before:border-l before:border-sun-line before:bg-sun ${
                luciHere ? "before:top-[calc(50%-6px)]" : "before:top-6"
              }`}
            >
              <p className="sr-only">Luci says</p>
              {/* screen readers hear each new reply as it arrives */}
              <p className="relative text-xl leading-snug text-ink sm:text-2xl" aria-live={isNewest ? "polite" : undefined}>
                {t.tutorText || <span className="text-muted">…</span>}
              </p>
              {/* English: shown by itself once you've answered; before that, only if you ask for it. */}
              {t.tutorEnglish &&
                (turns.slice(i + 1).some((x) => x.rawText) || shownEnglish.has(t.id) ? (
                  <p className="mt-3 text-lg italic text-muted" lang="en">
                    {t.tutorEnglish}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShownEnglish((s) => new Set(s).add(t.id))}
                    className="mt-3 rounded-sm text-sm text-muted underline decoration-line underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
                  >
                    Show English
                  </button>
                ))}
              {/* J1: why Luci replied this way, in one plain line */}
              {t.why && <p className="mt-3 border-t border-sun-line pt-2 text-sm text-muted">{t.why}</p>}
            </div>
          </div>
        )}
      </article>
    );
  };
  const endButton = (
    <button
      type="button"
      onClick={() => {
        setEnding({ notice: notice ?? null });
        void end();
      }}
      disabled={turns.length < 2}
      className={`${btn.secondary} shrink-0`}
    >
      End session
    </button>
  );
  const typeForm = (className: string) => (
    <form
      className={className}
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
        placeholder="Or type in Spanish"
        aria-label="Your answer in Spanish"
        className="min-w-0 flex-1 rounded-sm border border-line bg-panel px-3 py-2 text-ink placeholder:text-muted focus:border-muted focus:outline-none"
      />
      <button type="submit" className={btn.primary}>
        Send
      </button>
    </form>
  );
  const luci = (className: string) => (
    <LuciFirefly mood={status} speechText={liveText} reaction={reaction.kind} reactionKey={reaction.n} className={className} />
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
     <div className={wide ? "grid grid-cols-[15rem_1fr] gap-10" : ""}>
      {wide && (
        <aside>
          <div className="sticky top-28 flex justify-center" data-luci-live="">
            {luci("h-60 w-60")}
          </div>
        </aside>
      )}
     <div className="min-w-0 space-y-6">
      {notice && (
        <p role="status" className="rounded-sm border border-sun-line bg-sun px-4 py-3 text-ink">
          {notice}
        </p>
      )}

      {/* J2: open before your first answer (the "it planned this from what I read" moment), then folded to one
          line with the glowing target words so the newest exchange stays at the top. */}
      {plan ? (
        <details
          open={lessonOpen}
          onToggle={(e) => setLessonOpen(e.currentTarget.open)}
          className="group/lesson rounded-md bg-panel px-5 py-4"
        >
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-5 gap-y-2 [&::-webkit-details-marker]:hidden">
            <span className="font-display text-lg font-extrabold">Tonight&apos;s lesson</span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 group-open/lesson:hidden">
              {plan.words.map((w) => (
                <span key={w.lemma} className={`font-bold ${known.includes(w.lemma) ? "glow-known" : "glow-learning"}`}>
                  {w.lemma}
                </span>
              ))}
            </span>
            <span className="ml-auto text-sm text-muted underline decoration-line underline-offset-4 transition-colors duration-150 group-hover/lesson:text-ink">
              <span className="group-open/lesson:hidden">Show plan</span>
              <span className="hidden group-open/lesson:inline">Hide plan</span>
            </span>
          </summary>
          <div className="mt-4">
            <LessonCard plan={plan} known={known} compact />
          </div>
        </details>
      ) : (
        <TargetChips words={targetWords} known={known} />
      )}

      {/* Newest exchange first. Inside an exchange the order stays natural: you, the correction, Luci's reply. */}
      {status === "listening" && (
        <section aria-label="You are speaking" className="exchange-newest">
          <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:gap-4">
            <p className={`${speaker} text-accent`}>You</p>
            <p className="text-2xl text-ink">{partial || <span className="text-muted">Listening…</span>}</p>
          </div>
        </section>
      )}

      {newest && renderExchange(newest, turns.length - 1, status !== "listening")}

      {recent.length > 0 && (
        <ol className="space-y-2 border-t border-line pt-2" aria-label="Earlier exchanges">
          {recent.map(({ t, i }) => (
            <li key={t.id}>{renderExchange(t, i, false)}</li>
          ))}
        </ol>
      )}
      {earlier.length > 0 && (
        <details className="group/earlier border-t border-line pt-4">
          <summary className="cursor-pointer list-none text-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open/earlier:hidden">Earlier in this conversation ({earlier.length})</span>
            <span className="hidden group-open/earlier:inline">Hide the earlier conversation</span>
          </summary>
          <ol className="mt-2 space-y-2" aria-label="Earlier in this conversation">
            {earlier.map(({ t, i }) => (
              <li key={t.id}>{renderExchange(t, i, false)}</li>
            ))}
          </ol>
        </details>
      )}
     </div>
     </div>

      {/* Controls stay pinned to the bottom of the screen so the demo never needs scrolling. Wide screens: one
          row (talk, type, end) so the newest exchange keeps the space. Narrow: talk row, then typing below. */}
      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-panel px-4 pb-4 pt-4">
        {setMode && <ModeToggle mode={mode} onChange={changeMode} />}
        {wide ? (
          <div className="flex items-center gap-4">
            {talkControl}
            {typeForm("flex min-w-0 flex-1 gap-2")}
            {endButton}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              {talkControl}
              {endButton}
            </div>
            <details ref={typeBox} open className="text-muted" onToggle={(e) => setTypingOpen(e.currentTarget.open)}>
              <summary className="cursor-pointer list-none text-sm transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
                {typingOpen ? "Hide typing" : "Type your answer instead"}
              </summary>
              {typeForm("mt-3 flex gap-2")}
            </details>
          </>
        )}
      </div>

      <KnownToast lemma={toasts[0] ?? null} onDone={dismissToast} />
    </div>
  );
}
