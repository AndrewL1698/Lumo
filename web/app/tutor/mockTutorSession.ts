"use client";
import {
  correctResponseCleanFixture,
  correctResponseEnglishFixture,
  correctResponseFixture,
  correctResponseOffTopicFixture,
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

const OPENER_EN = "I saw that you read about the transit strike today. What do you think?";
// HACK: hand-written English for replyTextFixture (the shared fixture is Spanish only).
const REPLY_EN = "Sure, I understand. The problem is that the strike goes on, right? How are you getting to work this week?";

// HACK: no shared fixture for an unclear turn; same shape as the off-topic one.
const correctResponseUnclear: CorrectResponse = {
  ...correctResponseOffTopicFixture,
  correction: { ...correctResponseOffTopicFixture.correction, utterance_id: "utt_demo_5", flag: "unclear" },
};

// Turns 1-2 are the stage demo (mistakes + "now known", then a clean answer); 3-5 show the turn flags.
const OPENER_WHY = "Opening with something you read today";

const SCRIPT: { raw: string; response: CorrectResponse; reply?: string; replyEn?: string; why?: string }[] = [
  { raw: rawTextFixture, response: correctResponseFixture, why: "Recast only: first time you've made these mistakes, so Lumo repeats it correctly instead of stopping you" },
  { raw: "me gusta mucho la casa grande", response: correctResponseCleanFixture, why: "Steering toward 'aprovechar': you hovered it this morning" },
  {
    raw: "Hi, my name is Shravan",
    response: correctResponseEnglishFixture,
    reply: "¡En español, por favor! Puedes decir: «Hola, me llamo Shravan». ¿Cómo llegas al trabajo?",
    replyEn: "In Spanish, please! You can say: 'Hola, me llamo Shravan.' How do you get to work?",
    why: "You answered in English, so Lumo asks for Spanish and offers the words",
  },
  {
    raw: "me gusta jugar al fútbol con mis amigos",
    response: correctResponseOffTopicFixture,
    reply: "¡Qué bien! Pero volvamos a la huelga: ¿cómo te afecta a ti?",
    replyEn: "Nice! But let's get back to the strike: how does it affect you?",
    why: "Off topic: Lumo gently steers back to the article",
  },
  {
    raw: "eh la mesa sí no",
    response: correctResponseUnclear,
    reply: "No te entendí bien. ¿Puedes repetirlo, por favor?",
    replyEn: "I didn't quite understand. Can you say it again, please?",
    why: "Couldn't follow that turn, so Lumo asks you to repeat it",
  },
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
    setTurns([{ id: "opener", rawText: "", tutorEnglish: OPENER_EN, why: OPENER_WHY }]);
    streamCaption("opener", OPENER);
  }, []);

  const pressTalk = useCallback(() => {
    clearAll();
    setStatus("listening");
    const words = SCRIPT[turnNo.current % SCRIPT.length].raw.split(" ");
    words.forEach((_, i) => later(() => setPartial(words.slice(0, i + 1).join(" ")), PARTIAL_MS * (i + 1)));
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
      patchTurn(id, { correction: step.response.correction, wordUpdates: step.response.wordUpdates, tutorEnglish: step.replyEn ?? REPLY_EN, why: step.why });
      setStatus("speaking");
      streamCaption(id, step.reply ?? replyTextFixture);
    }, CHECK_MS);
  }, []);

  const sendText = useCallback((_text: string) => {
    // TODO(demo): typed mode is a stretch goal; not simulated.
  }, []);

  const end = useCallback(() => {
    clearAll();
    setStatus("idle");
    setPartial("");
    later(() => setRecap(recapFixture), 1800); // like the real /api/tutor/end, the recap takes a moment
  }, []);

  return {
    status,
    partial,
    turns,
    targetWords: tutorContextFixture.targetWords,
    plan: tutorContextFixture.plan ?? null,
    recap,
    start,
    pressTalk,
    releaseTalk,
    sendText,
    end,
  };
}
