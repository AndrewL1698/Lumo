"use client";
import {
  correctResponseCleanFixture,
  correctResponseFixture,
  rawTextFixture,
  recapFixture,
  replyTextFixture,
  tutorContextFixture,
} from "@parrot/shared";
import type { CorrectResponse } from "@parrot/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorSession, TutorStatus, TutorTurn } from "./session";

// HACK: scripted stand-in for Andrew's useTutorSession (voice-plan §8). No mic, no network, no API credits.
// Same shape as TutorSession so the real hook replaces it with a one-line import change (see page.tsx).
// The opener is a turn with rawText "" (tutor-only), mirroring /reply with utteranceId null.

const OPENER = "Vi que hoy leíste sobre la huelga del transporte. ¿Qué opinas?";

const SCRIPT: { raw: string; response: CorrectResponse }[] = [
  { raw: rawTextFixture, response: correctResponseFixture },
  { raw: "me gusta mucho la casa grande", response: correctResponseCleanFixture },
];

const PARTIAL_MS = 220;
const CHECK_MS = 1200; // ~ the 1.5s correction target
const CAPTION_MS = 70;

export function useMockTutorSession(): TutorSession {
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [partial, setPartial] = useState("");
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [recap, setRecap] = useState<TutorSession["recap"]>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const turnNo = useRef(0);
  const started = useRef(false);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  // Reset the start guard too: StrictMode unmounts once in dev, which clears the timers, so start() must run again.
  useEffect(
    () => () => {
      clearAll();
      started.current = false;
    },
    [],
  );

  const patchTurn = (id: string, patch: Partial<TutorTurn>) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const streamCaption = (id: string, text: string, done?: () => void) => {
    const words = text.split(" ");
    words.forEach((_, i) =>
      later(() => patchTurn(id, { tutorText: words.slice(0, i + 1).join(" ") }), CAPTION_MS * (i + 1)),
    );
    later(() => {
      setStatus("idle");
      done?.();
    }, CAPTION_MS * (words.length + 1));
  };

  const start = useCallback(() => {
    if (started.current) return; // StrictMode double-invoke guard
    started.current = true;
    setStatus("speaking");
    setTurns([{ id: "opener", rawText: "" }]);
    streamCaption("opener", OPENER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pressTalk = useCallback(() => {
    clearAll();
    setStatus("listening");
    const words = SCRIPT[turnNo.current % SCRIPT.length].raw.split(" ");
    words.forEach((_, i) => later(() => setPartial(words.slice(0, i + 1).join(" ")), PARTIAL_MS * (i + 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const releaseTalk = useCallback(() => {
    clearAll();
    const step = SCRIPT[turnNo.current % SCRIPT.length];
    const id = `u_${turnNo.current + 1}`;
    turnNo.current += 1;
    setPartial("");
    setStatus("checking");
    setTurns((ts) => [...ts, { id, rawText: step.raw }]);
    later(() => {
      patchTurn(id, { correction: step.response.correction, wordUpdates: step.response.wordUpdates });
      setStatus("speaking");
      streamCaption(id, replyTextFixture);
    }, CHECK_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendText = useCallback((_text: string) => {
    // TODO(demo): typed mode is a stretch goal; not simulated.
  }, []);

  const end = useCallback(() => {
    clearAll();
    setStatus("idle");
    setPartial("");
    setRecap(recapFixture);
  }, []);

  return { status, partial, turns, targetWords: tutorContextFixture.targetWords, recap, start, pressTalk, releaseTalk, sendText, end };
}
