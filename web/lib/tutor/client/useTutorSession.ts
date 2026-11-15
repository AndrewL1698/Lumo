"use client";
/**
 * useTutorSession: glues the recorder, realtime STT, the two Claude lanes, the chunker, the audio queue
 * and the timeline into push-to-talk turns (voice-plan §1.1, §1.2, §1.4, §1.7, §1.8, §2).
 * Browser only. No keys: everything goes through /web API routes. Nothing here throws to the UI.
 */
import {
  CorrectResponse,
  Recap,
  SttBatchResponse,
  SttTokenResponse,
  TutorContext,
  TutorTranslateResponse,
  type CorrectionResult,
  type HistoryTurn,
  type Level,
  type SttPath,
  type TargetWord,
  type TurnTimeline,
} from "@parrot/shared";
import { useEffect, useRef, useState } from "react";
import { TUTOR } from "../../config";
import { createChunker } from "../chunker";
import type {
  AudioQueue,
  PttRecorder,
  ScribeClient,
  TimelineRecorder,
  Turn,
  TutorStatus,
  UseTutorSession,
} from "../types";
import { createAudioQueue } from "./audioQueue";
import { createPttRecorder, encodeWav } from "./pttRecorder";
import { createScribeClient } from "./scribeRealtime";
import { createTimeline } from "./timeline";

const TOKEN_MAX_AGE_MS = 10 * 60_000; // tokens expire after 15 min; refetch well before that
const JSON_HEADERS = { "Content-Type": "application/json" };

type Setters = {
  status: (s: TutorStatus) => void;
  partial: (s: string) => void;
  turns: (t: Turn[]) => void;
  targetWords: (w: TargetWord[]) => void;
  recap: (r: Recap | null) => void;
  notice: (n: string | null) => void;
  lastTimeline: (t: TurnTimeline | null) => void;
  plan: (p: UseTutorSession["plan"]) => void;
  sessionId: (id: string | null) => void;
};

/** One tutor reply (the opener or the answer to one utterance). */
type Reply = {
  turnNo: number;
  turnId: string;
  abort: AbortController;
  /** Chunks whose audio actually started, in order: what survives a barge-in. */
  started: string[];
  timeline: TimelineRecorder | null; // null for the opener
  correctionDone: Promise<void>;
  done: boolean;
};

type Controller = Pick<UseTutorSession, "start" | "pressTalk" | "releaseTalk" | "sendText" | "end"> & {
  dispose: () => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // HACK: randomUUID needs a secure context (localhost and https are fine); this is only a fallback.
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toHistory(turns: Turn[]): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (const t of turns) {
    if (t.rawText) out.push({ role: "learner", text: t.rawText });
    if (t.tutorText) out.push({ role: "tutor", text: t.tutorText });
  }
  return out;
}

/** All mutable machinery lives in this closure, so the functions it returns are stable for the hook's life. */
function createController(set: Setters, forceBatch: () => boolean, placement: () => boolean): Controller {
  /** Bumped by end() and dispose(): anything async started under an older epoch is dropped. */
  let epoch = 0;
  let started = false;
  let starting = false;
  let sessionId = "";
  /** The learner's level from the session context; sets the tutor's speaking speed. */
  let level: Level | undefined;
  let turns: Turn[] = [];
  /** Correction requests still in flight; end() waits for them so the recap includes the last turn. */
  const pendingCorrections = new Set<Promise<void>>();

  let queue: AudioQueue | null = null;
  let recorder: PttRecorder | null = null; // null = no mic (denied or not started)
  let scribe: ScribeClient | null = null;
  let token: { token: string; model: string; at: number } | null = null;
  let tokenFetch: Promise<void> | null = null;

  /** Bumped per reply and on barge-in; results tagged with an older number are dropped. */
  let turnNo = 0;
  let active: Reply | null = null;
  let listening = false;
  let transcribing = false;
  /** The take being recorded / transcribed. */
  let take: { id: string; timeline: TimelineRecorder } | null = null;

  /** TTS chunks that failed in a row; a chunk that starts playing resets it (voice-plan §1.7). */
  let ttsFailuresInARow = 0;
  let browserVoice = false;
  const onTtsFailed = () => {
    if (browserVoice) return;
    ttsFailuresInARow += 1;
    if (ttsFailuresInARow < 2) {
      set.notice("Audio unavailable for part of the reply; showing captions.");
      return;
    }
    // HACK: ElevenLabs looks down: the browser's built-in voice for the rest of the session (from the next
    // reply; this one keeps its captions). Stop the old queue so a late ElevenLabs chunk can't overlap.
    browserVoice = true;
    queue?.stopAll();
    queue = createAudioQueue({ mode: "browser", level: () => level });
    set.notice("Luci's voice is unavailable, so your browser's voice will read her replies.");
  };
  const getQueue = (): AudioQueue => {
    queue ??= createAudioQueue({ level: () => level, onChunkFailed: onTtsFailed });
    return queue;
  };

  const setTurns = (next: Turn[]) => {
    turns = next;
    set.turns(next);
  };
  const updateTurn = (id: string, fn: (t: Turn) => Turn) =>
    setTurns(turns.map((t) => (t.id === id ? fn(t) : t)));

  // ---------- STT token ----------

  function fetchToken() {
    if (forceBatch() || tokenFetch) return;
    tokenFetch = (async () => {
      try {
        const res = await fetch("/api/stt-token", { cache: "no-store" });
        if (!res.ok) throw new Error(`/api/stt-token ${res.status}`);
        const parsed = SttTokenResponse.parse(await res.json());
        token = { ...parsed, at: Date.now() };
      } catch {
        token = null; // the next press uses the batch path
      } finally {
        tokenFetch = null;
      }
    })();
  }

  function refreshTokenIfStale() {
    if (token && Date.now() - token.at > TOKEN_MAX_AGE_MS) token = null;
    if (!token) fetchToken();
  }

  /** Tokens are single-use: hand it out once and fetch the next one. */
  function takeToken(): { token: string; model: string } | null {
    refreshTokenIfStale();
    const t = token;
    token = null;
    if (t) fetchToken();
    return t;
  }

  // ---------- turn end, barge-in ----------

  function finishReply(reply: Reply) {
    if (reply.done) return;
    reply.done = true;
    if (active === reply) active = null;
    refreshTokenIfStale();
    const tl = reply.timeline;
    if (!tl) return; // the opener has no timeline
    // Wait for the correction lane (it never rejects) so tCorrectionShown is in the posted numbers.
    void reply.correctionDone.then(() => {
      const timeline = tl.toTimeline();
      if (!timeline) return;
      set.lastTimeline(timeline);
      fetch("/api/tutor/metrics", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(timeline),
        keepalive: true,
      }).catch(() => {});
    });
  }

  /** Stop the current reply (stream and audio). `trim`: keep only the sentences whose audio had started. */
  function stopReply(trim: boolean) {
    const reply = active;
    if (!reply || reply.done) return;
    reply.abort.abort();
    getQueue().stopAll();
    turnNo++; // late stream / audio results for the old number are dropped
    if (trim) {
      // The English must match what was actually heard, so it is dropped and fetched again.
      updateTurn(reply.turnId, (t) => ({ ...t, tutorText: reply.started.join(" "), tutorEnglish: undefined }));
      translateLane(reply.turnId);
    }
    finishReply(reply);
  }

  /** English for a tutor line (shown under its bubble). Fire and forget: a failure just shows no English. */
  function translateLane(turnId: string) {
    const text = turns.find((t) => t.id === turnId)?.tutorText?.trim();
    if (!text) return;
    const myEpoch = epoch;
    void (async () => {
      try {
        const res = await fetch("/api/tutor/translate", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ text: text.slice(0, 1000) }),
        });
        if (!res.ok) return;
        const { english } = TutorTranslateResponse.parse(await res.json());
        if (epoch !== myEpoch) return;
        // Only if the line is still the one that was translated (a barge-in trims it).
        updateTurn(turnId, (t) => (t.tutorText?.trim() === text ? { ...t, tutorEnglish: english } : t));
      } catch {
        // no English for this line
      }
    })();
  }

  function closeScribe() {
    try {
      scribe?.close();
    } catch {
      // already closed
    }
    scribe = null;
  }

  // ---------- the two lanes ----------

  async function correctLane(
    id: string,
    rawText: string,
    sttPath: SttPath,
    tutorPrevious: string | undefined,
    timeline: TimelineRecorder,
  ): Promise<void> {
    try {
      const res = await fetch("/api/tutor/correct", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ sessionId, utteranceId: id, rawText, tutorPrevious, sttPath }),
      });
      if (!res.ok) throw new Error(`/api/tutor/correct ${res.status}`);
      const parsed = CorrectResponse.parse(await res.json());
      const failed = res.headers.get("X-Correction-Failed") === "1";
      // Always lands on its own turn, even if that turn was barged over.
      updateTurn(id, (t) => ({
        ...t,
        correction: parsed.correction,
        wordUpdates: parsed.wordUpdates,
        ...(failed ? { correctionFailed: true } : {}),
      }));
      if (!failed) timeline.mark("tCorrectionShown");
    } catch {
      const empty: CorrectionResult = {
        utterance_id: id,
        errors: [],
        target_words_used: [],
        overall_ok: true,
      };
      try {
        updateTurn(id, (t) => ({ ...t, correction: empty, wordUpdates: [], correctionFailed: true }));
      } catch {
        // never reject: finishReply waits on this promise
      }
    }
  }

  async function replyLane(args: {
    turnId: string;
    utteranceId: string | null;
    rawText: string | null;
    history: HistoryTurn[];
    timeline: TimelineRecorder | null;
    correctionDone: Promise<void>;
  }): Promise<void> {
    const q = getQueue();
    const myEpoch = epoch;
    const myTurn = ++turnNo;
    const reply: Reply = {
      turnNo: myTurn,
      turnId: args.turnId,
      abort: new AbortController(),
      started: [],
      timeline: args.timeline,
      correctionDone: args.correctionDone,
      done: false,
    };
    active = reply;
    const live = () => epoch === myEpoch && turnNo === myTurn && !reply.done;

    let index = 0;
    const speak = (chunk: string) => {
      args.timeline?.mark("tFirstChunk");
      q.enqueue(myTurn, index++, chunk, () => {
        ttsFailuresInARow = 0;
        if (!live()) return;
        reply.started.push(chunk);
        // HACK: the queue has no separate "TTS bytes arrived" signal, so both marks are set at audio start.
        args.timeline?.mark("tTtsFirstBytes");
        args.timeline?.mark("tAudioStart");
        set.status("speaking");
      });
    };
    const caption = (text: string) =>
      updateTurn(args.turnId, (t) => ({ ...t, tutorText: (t.tutorText ?? "") + text }));

    const chunker = createChunker(); // a new one per reply
    let gotText = false;
    try {
      const res = await fetch("/api/tutor/reply", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          sessionId,
          utteranceId: args.utteranceId,
          rawText: args.rawText,
          history: args.history,
        }),
        signal: reply.abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`/api/tutor/reply ${res.status}`);
      // X-Reply-Fallback: 1 means the body is the canned line; it is handled like any reply.
      // J1: X-Parrot-Why is URI-encoded (header values can't carry accents); a bad value just leaves `why` unset.
      try {
        const rawWhy = res.headers.get("X-Parrot-Why");
        const why = rawWhy ? decodeURIComponent(rawWhy) : "";
        if (why && live()) updateTurn(args.turnId, (t) => ({ ...t, why }));
      } catch {
        // malformed header: no why line for this turn
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      for (;;) {
        const { done, value } = await reader.read();
        if (!live()) {
          void reader.cancel().catch(() => {});
          return;
        }
        const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
        if (text) {
          gotText = true;
          args.timeline?.mark("tReplyFirstToken");
          caption(text); // captions render regardless of audio
          for (const chunk of chunker.push(text)) speak(chunk);
        }
        if (done) break;
      }
    } catch {
      if (!live()) return; // aborted by a barge-in, end() or unmount
      if (!gotText) {
        const canned = args.rawText === null ? TUTOR.cannedOpener : TUTOR.cannedRepeat;
        caption(canned);
        chunker.push(canned);
      }
      // A stream that broke midway keeps what it has.
    }

    try {
      if (!live()) return;
      for (const chunk of chunker.flush()) speak(chunk); // the last sentence only comes out of flush()
      translateLane(args.turnId); // the text is complete; the English arrives while the audio plays
      if (reply.started.length === 0) set.status("speaking"); // stream ended; audio is loading or playing
      await q.idle(myTurn); // covers everything enqueued above
      if (!live()) return;
      finishReply(reply);
      set.status("idle");
    } catch {
      if (!live()) return;
      finishReply(reply);
      set.status("idle");
    }
  }

  /** A finished transcript (spoken or typed): append the learner turn and fire both lanes. */
  function runTurn(id: string, rawText: string, sttPath: SttPath, timeline: TimelineRecorder) {
    const history = toHistory(turns); // everything before this utterance
    let tutorPrevious: string | undefined;
    for (const h of history) if (h.role === "tutor") tutorPrevious = h.text;
    setTurns([...turns, { id, rawText, sttPath }]); // rawText is verbatim: never trimmed or edited
    set.status("checking");
    const correctionDone = correctLane(id, rawText, sttPath, tutorPrevious, timeline);
    pendingCorrections.add(correctionDone);
    void correctionDone.finally(() => pendingCorrections.delete(correctionDone));
    void replyLane({ turnId: id, utteranceId: id, rawText, history, timeline, correctionDone });
  }

  // ---------- STT after release ----------

  async function transcribe(
    current: { id: string; timeline: TimelineRecorder },
    rec: PttRecorder,
    socket: ScribeClient | null,
  ) {
    const myEpoch = epoch;
    try {
      const { pcm, tail, durationMs } = await rec.stop(TUTOR.tailMs);
      set.partial("");
      if (epoch !== myEpoch) return;
      if (durationMs < TUTOR.minHoldMs) {
        set.status("idle"); // a tap, not a turn
        return;
      }
      set.status("checking");

      let text: string | null = null;
      let path: SttPath = "realtime";
      if (socket) {
        try {
          // `tail` is exactly the audio not yet sent through sendAudio.
          text = await socket.commit(tail, TUTOR.sttCommitTimeoutMs);
        } catch {
          text = null;
        }
      }
      if (text === null) {
        path = "batch";
        try {
          const res = await fetch("/api/stt-batch", {
            method: "POST",
            headers: { "Content-Type": "audio/wav" },
            body: encodeWav(pcm),
          });
          if (!res.ok) throw new Error(`/api/stt-batch ${res.status}`);
          text = SttBatchResponse.parse(await res.json()).text;
        } catch {
          text = null;
        }
      }
      if (epoch !== myEpoch) return;
      if (text === null) {
        set.notice("Didn't catch that, try again");
        set.status("idle");
        return;
      }
      if (!text.trim()) {
        set.status("idle"); // empty transcript: ignore the turn silently
        return;
      }
      current.timeline.setSttPath(path);
      current.timeline.mark("tSttFinal");
      transcribing = false;
      runTurn(current.id, text, path, current.timeline);
    } catch {
      if (epoch !== myEpoch) return;
      set.notice("Didn't catch that, try again");
      set.status("idle");
    } finally {
      try {
        socket?.close();
      } catch {
        // already closed
      }
      if (scribe === socket) scribe = null;
      if (epoch === myEpoch) transcribing = false;
    }
  }

  /** Stop everything that belongs to the current session. Safe to call twice. */
  function teardown() {
    epoch++;
    started = false;
    starting = false;
    listening = false;
    transcribing = false;
    take = null;
    try {
      stopReply(false);
      queue?.stopAll();
    } catch {
      // ignore
    }
    closeScribe();
    try {
      recorder?.dispose();
    } catch {
      // ignore
    }
    recorder = null;
  }

  // ---------- public ----------

  return {
    async start() {
      if (started || starting) return;
      starting = true;
      const myEpoch = epoch;
      try {
        set.notice(null);
        set.recap(null);
        // Ask for the mic inside the click, in parallel with the context fetch.
        const rec = createPttRecorder();
        const micReady = rec.init().then(
          () => true,
          () => false,
        );
        fetchToken();

        let context: TutorContext | null = null;
        try {
          // Onboarding level check (D-020): an empty context and fixed questions.
          const url = placement() ? "/api/tutor/context?placement=1" : "/api/tutor/context";
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(`/api/tutor/context ${res.status}`);
          context = TutorContext.parse(await res.json());
        } catch {
          context = null;
        }
        const micOk = await micReady;
        if (epoch !== myEpoch || !context) {
          // Unmounted or ended meanwhile (StrictMode), or no session: never leave a mic open.
          rec.dispose();
          if (epoch === myEpoch) set.notice("Couldn't start the session. Try again.");
          return;
        }

        sessionId = context.sessionId;
        level = context.level;
        set.sessionId(sessionId);
        set.targetWords(context.targetWords);
        set.plan(context.plan ?? null);
        if (micOk) recorder = rec;
        else {
          rec.dispose();
          recorder = null;
          set.notice("Microphone unavailable. You can type your answers instead.");
        }
        started = true;
        setTurns([{ id: "opener", rawText: "", tutorText: "" }]);
        set.status("checking");
        void replyLane({
          turnId: "opener",
          utteranceId: null,
          rawText: null,
          history: [],
          timeline: null,
          correctionDone: Promise.resolve(),
        });
      } catch {
        if (epoch === myEpoch) set.notice("Couldn't start the session. Try again.");
      } finally {
        if (epoch === myEpoch) starting = false;
      }
    },

    pressTalk() {
      try {
        if (!started || listening || transcribing) return;
        stopReply(true); // barge-in; an in-flight /correct for the earlier utterance is left alone
        if (!recorder) {
          set.status("idle");
          set.notice("Microphone unavailable. You can type your answers instead.");
          return;
        }
        const id = newId();
        const timeline = createTimeline(sessionId, id);

        let socket: ScribeClient | null = null;
        const tok = forceBatch() ? null : takeToken();
        if (tok) {
          try {
            socket = createScribeClient({
              token: tok.token,
              model: tok.model,
              onPartial: (text) => {
                if (scribe === socket && listening) set.partial(text);
              },
            });
          } catch {
            socket = null; // batch path
          }
        }
        try {
          recorder.start((chunk) => socket?.sendAudio(chunk));
        } catch {
          socket?.close();
          set.status("idle");
          set.notice("Microphone unavailable. You can type your answers instead.");
          return;
        }
        scribe = socket;
        take = { id, timeline };
        listening = true;
        timeline.mark("tPress");
        set.notice(null);
        set.partial("");
        set.status("listening");
      } catch {
        set.notice("Something went wrong. Try again.");
      }
    },

    releaseTalk() {
      if (!listening || !take || !recorder) return;
      listening = false;
      transcribing = true;
      take.timeline.mark("tRelease");
      const current = take;
      take = null;
      void transcribe(current, recorder, scribe);
    },

    sendText(text: string) {
      try {
        if (!started || listening || transcribing || !text.trim()) return;
        stopReply(true);
        set.notice(null);
        const id = newId();
        // tPress = tRelease = tSttFinal = now for a typed turn.
        let fixed: number | null = performance.now();
        const timeline = createTimeline(sessionId, id, () => fixed ?? performance.now());
        timeline.setSttPath("typed");
        timeline.mark("tPress");
        timeline.mark("tRelease");
        timeline.mark("tSttFinal");
        fixed = null;
        runTurn(id, text, "typed", timeline);
      } catch {
        set.notice("Something went wrong. Try again.");
      }
    },

    async end() {
      if (!started) return;
      const id = sessionId;
      // Grab the in-flight corrections before teardown; the server must record the last turn before it
      // builds the recap, or a word credited a moment later would show under "Review tomorrow".
      const pending = [...pendingCorrections];
      teardown();
      set.partial("");
      set.status("idle");
      try {
        if (pending.length)
          await Promise.race([
            Promise.all(pending),
            // The server's cap: model timeout + one learner-model write + network.
            new Promise((r) => setTimeout(r, TUTOR.correctTimeoutMs + TUTOR.recordTimeoutMs + 500)),
          ]);
        const res = await fetch("/api/tutor/end", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ sessionId: id }),
        });
        if (!res.ok) throw new Error(`/api/tutor/end ${res.status}`);
        set.recap(Recap.parse(await res.json()));
      } catch {
        set.notice("Couldn't load the session recap.");
      }
    },

    dispose: teardown,
  };
}

export function useTutorSession(opts?: { forceBatch?: boolean; placement?: boolean }): UseTutorSession {
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [partial, setPartial] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [targetWords, setTargetWords] = useState<TargetWord[]>([]);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastTimeline, setLastTimeline] = useState<TurnTimeline | null>(null);
  const [plan, setPlan] = useState<UseTutorSession["plan"]>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const forceBatchRef = useRef(false);
  const placementRef = useRef(false);
  useEffect(() => {
    forceBatchRef.current = opts?.forceBatch === true;
    placementRef.current = opts?.placement === true;
  });

  // Created once; it holds no resources until start(), so StrictMode's discarded second copy is harmless.
  const [ctl] = useState(() =>
    createController(
      {
        status: setStatus,
        partial: setPartial,
        turns: setTurns,
        targetWords: setTargetWords,
        recap: setRecap,
        notice: setNotice,
        lastTimeline: setLastTimeline,
        plan: setPlan,
        sessionId: setSessionId,
      },
      () => forceBatchRef.current,
      () => placementRef.current,
    ),
  );

  // Unmount (and StrictMode's fake unmount): stop audio, close the socket, release the mic.
  // The controller is reusable afterwards, so a remount can start() again.
  useEffect(() => () => ctl.dispose(), [ctl]);

  return {
    status,
    partial,
    turns,
    targetWords,
    recap,
    notice,
    lastTimeline,
    plan,
    sessionId,
    start: ctl.start,
    pressTalk: ctl.pressTalk,
    releaseTalk: ctl.releaseTalk,
    sendText: ctl.sendText,
    end: ctl.end,
  };
}
