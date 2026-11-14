"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MOCK_CORRECT_RESPONSE,
  MOCK_CORRECT_RESPONSE_CLEAN,
  MOCK_RAW_TRANSCRIPT,
  MOCK_RECAP,
  MOCK_TUTOR_CONTEXT,
  MOCK_TUTOR_OPENER,
  MOCK_TUTOR_REPLY,
} from "../mocks";
import type { CorrectResponse, TutorSession, TutorStatus, TutorTurn } from "./types";

// HACK: scripted stand-in for Andrew's useTutorSession (voice-plan §8). No mic, no network, no API credits.
// Same shape as TutorSession so the real hook can replace it with a one-line import change.
// The opener is a turn with rawText "" (tutor-only), mirroring /reply with utteranceId null.

const SCRIPT: { raw: string; response: CorrectResponse }[] = [
  { raw: MOCK_RAW_TRANSCRIPT, response: MOCK_CORRECT_RESPONSE },
  { raw: "me gusta mucho la casa grande", response: MOCK_CORRECT_RESPONSE_CLEAN },
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
  useEffect(() => clearAll, []);

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
    streamCaption("opener", MOCK_TUTOR_OPENER);
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
      streamCaption(id, MOCK_TUTOR_REPLY);
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
    setRecap(MOCK_RECAP);
  }, []);

  return { status, partial, turns, targetWords: MOCK_TUTOR_CONTEXT.targetWords, recap, start, pressTalk, releaseTalk, sendText, end };
}
