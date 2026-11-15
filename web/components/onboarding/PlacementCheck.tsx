"use client";
import { PlacementResponse, type HistoryTurn, type Level } from "@parrot/shared";
import { useEffect, useRef, useState } from "react";
import { LuciFirefly } from "@/components/tutor/LuciFirefly";
import { PushToTalk } from "@/components/tutor/PushToTalk";
import { TranscriptView } from "@/components/tutor/TranscriptView";
import { btn, eyebrow } from "@/components/ui/PageHeader";
import { useTutorSession } from "@/lib/tutor/client/useTutorSession";
import { LEVELS } from "./LevelPicker";

const QUESTIONS = 3;
const title = (l: Level) => LEVELS.find((x) => x.value === l)?.title ?? l;

// Onboarding step 2 (D-020): Lumo asks three questions out loud, then suggests a level with a reason.
// The learner decides: use the suggestion or keep their own pick. Skipping, or any failure, keeps their pick.
export function PlacementCheck({ selfLevel, onDone }: { selfLevel: Level; onDone: (level: Level) => void }) {
  const { status, partial, turns, notice, sessionId, start, pressTalk, releaseTalk, sendText } = useTutorSession({
    placement: true,
  });
  const [begun, setBegun] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<PlacementResponse | "failed" | null>(null);
  const asked = useRef(false);
  const typeInput = useRef<HTMLInputElement>(null);

  const answers = turns.filter((t) => t.rawText);
  const done = answers.length >= QUESTIONS;
  const lastChecked = done && answers[QUESTIONS - 1]?.correction !== undefined;
  const tutorLine = [...turns].reverse().find((t) => t.tutorText)?.tutorText;

  // Once the third answer has been checked, ask for a level (once).
  useEffect(() => {
    if (!lastChecked || !sessionId || asked.current) return;
    asked.current = true;
    const history: HistoryTurn[] = [];
    for (const t of turns) {
      if (t.rawText) history.push({ role: "learner", text: t.rawText });
      if (t.tutorText) history.push({ role: "tutor", text: t.tutorText });
    }
    fetch("/api/tutor/placement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, history }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`/api/tutor/placement ${res.status}`);
        setResult(PlacementResponse.parse(await res.json()));
      })
      .catch(() => setResult("failed"));
  }, [lastChecked, sessionId, turns]);

  // Cursor in the type box whenever Lumo is waiting (Space on the empty box still talks; see PushToTalk).
  const awaiting = begun && !done && status === "idle" && !!tutorLine;
  useEffect(() => {
    if (awaiting) typeInput.current?.focus({ preventScroll: true });
  }, [awaiting, answers.length]);

  if (!begun) {
    return (
      <section className="rounded-sm border border-line bg-panel p-6">
        <p className={eyebrow}>Optional · about 1 minute</p>
        <h2 className="mt-2 text-2xl font-bold text-ink">Quick check with Lumo</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Lumo asks three short questions out loud, from easy to harder. Answer in Spanish as well as you can: hold Space
          or the button to talk, or type. Saying &quot;no sé&quot; is fine. Then Lumo suggests a level and tells you why.
          You decide.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setBegun(true);
              void start();
            }}
            className={`${btn.primary} h-12 px-6 text-lg`}
          >
            Start the check
          </button>
          <button type="button" onClick={() => onDone(selfLevel)} className={`${btn.secondary} h-12 px-6`}>
            Skip, keep {title(selfLevel)}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {notice && (
        <p role="status" className="rounded-sm border border-sun-line bg-sun px-4 py-3 text-ink">
          {notice}
        </p>
      )}

      <p className={eyebrow}>{done ? "All three answered" : `Question ${answers.length + 1} of ${QUESTIONS}`}</p>

      <div className="flex items-center gap-4">
        <LuciFirefly mood={status} className="h-24 w-24 shrink-0 sm:h-32 sm:w-32" />
        <p className="min-w-0 flex-1 rounded-md border border-sun-line bg-sun px-4 py-3 text-xl leading-snug text-ink">
          {tutorLine || "…"}
        </p>
      </div>

      {answers.length > 0 && (
        <ol className="divide-y divide-line border-t border-line">
          {answers.map((t, i) => (
            <li key={t.id} className="grid gap-2 py-4 sm:grid-cols-[6rem_1fr] sm:gap-4">
              <p className="pt-2 font-mono text-xs uppercase tracking-wider text-muted">Answer {i + 1}</p>
              <div>
                <TranscriptView raw={t.rawText} result={t.correction} />
                {!t.correction && <p className="font-mono text-sm text-muted">Checking</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {status === "listening" && <p className="text-2xl text-muted">{partial || "Listening"}</p>}

      {!done && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <PushToTalk status={status} onPress={pressTalk} onRelease={releaseTalk} />
            <button type="button" onClick={() => onDone(selfLevel)} className={btn.secondary}>
              Skip, keep {title(selfLevel)}
            </button>
          </div>
          <form
            className="flex gap-2"
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
        </div>
      )}

      {done && result === null && (
        <p role="status" className="font-mono text-sm text-muted">
          Lumo is working out your level
        </p>
      )}

      {result === "failed" && (
        <div className="rounded-sm border border-line bg-panel p-6">
          <p className="text-ink">Lumo couldn&apos;t work out a level this time, so your choice stays: {title(selfLevel)}.</p>
          <button type="button" onClick={() => onDone(selfLevel)} className={`${btn.primary} mt-4`}>
            Continue
          </button>
        </div>
      )}

      {result && result !== "failed" && (
        <div className="rounded-sm border border-sun-line bg-sun p-6">
          <p className={eyebrow}>Lumo suggests</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{title(result.level)}</h2>
          <p className="mt-3 text-lg text-ink">{result.reason_en}</p>
          {result.evidence_en.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
              {result.evidence_en.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {result.level === selfLevel ? (
              <button type="button" onClick={() => onDone(selfLevel)} className={`${btn.primary} h-12 px-6`}>
                That matches my pick. Continue
              </button>
            ) : (
              <>
                <button type="button" onClick={() => onDone(result.level)} className={`${btn.primary} h-12 px-6`}>
                  Use {title(result.level)}
                </button>
                <button type="button" onClick={() => onDone(selfLevel)} className={`${btn.secondary} h-12 px-6`}>
                  Keep {title(selfLevel)}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
