"use client";

// Pass B recording tool (voice-plan §6): a teammate reads each test sentence aloud, we save 16 kHz mono WAVs.
// Nothing here touches the network; files are downloaded and moved by hand into eval/stt-test/audio/B/.
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { TUTOR } from "@/lib/config";
import { createPttRecorder, encodeWav } from "@/lib/tutor/client/pttRecorder";
import type { PttRecorder } from "@/lib/tutor/types";

type Sentence = { id: string; text: string };
type Phase = "idle" | "starting" | "recording" | "stopping" | "recorded";
type Take = { pcm: Int16Array; durationMs: number; url: string };

// Copy of eval/stt-test/dev-sentences.json (id + text only).
const DEV_SENTENCES: Sentence[] = [
  { id: "dev1", text: "yo tiene la problema porque la huelga no termina" },
  { id: "dev2", text: "ayer nosotros come arroz con pollo en la casa de mi abuela" },
  { id: "dev3", text: "mañana voy a visitar a mis primos en la ciudad" },
];

const cleanReader = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

function parseSentences(json: unknown): Sentence[] {
  if (!Array.isArray(json)) throw new Error("Expected a JSON array of { id, text }.");
  const out: Sentence[] = [];
  for (const item of json) {
    const rec = item as { id?: unknown; text?: unknown } | null;
    if (!rec || typeof rec.id !== "string" || typeof rec.text !== "string") {
      throw new Error("Every entry needs a string `id` and a string `text`.");
    }
    out.push({ id: rec.id, text: rec.text });
  }
  if (out.length === 0) throw new Error("The file has no sentences.");
  return out;
}

const btn = "rounded border border-gray-400 px-3 py-1 text-sm disabled:opacity-40";

export function RecordPanel() {
  const [reader, setReader] = useState("");
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [take, setTake] = useState<Take | null>(null);
  const [level, setLevel] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const recRef = useRef<PttRecorder | null>(null);
  const initedRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const takeUrlRef = useRef<string | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRef = useRef<() => void>(() => {});

  const readerId = cleanReader(reader);
  const current = index < sentences.length ? sentences[index] : null;
  const finished = sentences.length > 0 && index >= sentences.length;

  function setPhase(p: Phase) {
    phaseRef.current = p;
    setPhaseState(p);
  }

  function clearTake() {
    if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    takeUrlRef.current = null;
    setTake(null);
  }

  function clearMaxTimer() {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
  }

  async function startRecording() {
    setNote(null);
    setMicError(null);
    const rec: PttRecorder = recRef.current ?? createPttRecorder();
    recRef.current = rec;
    if (!initedRef.current) {
      setPhase("starting");
      try {
        await rec.init();
        initedRef.current = true;
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        setMicError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Microphone access was denied. Allow the mic for this site in the browser's address bar, then press Record again."
            : name === "NotFoundError"
              ? "No microphone found. Plug one in and press Record again."
              : `Could not start the microphone (${err instanceof Error ? err.message : String(err)}).`,
        );
        try {
          rec.dispose();
        } catch {
          // ignore
        }
        recRef.current = null;
        setPhase("idle");
        return;
      }
    }
    clearTake();
    setLevel(0);
    try {
      rec.start((pcm) => {
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        const rms = pcm.length ? Math.sqrt(sum / pcm.length) / 32768 : 0;
        setLevel(Math.min(1, rms * 6)); // speech RMS is small; scale so normal talking fills most of the bar
      });
    } catch (err) {
      setMicError(`Could not start recording (${err instanceof Error ? err.message : String(err)}).`);
      setPhase("idle");
      return;
    }
    setPhase("recording");
    clearMaxTimer();
    maxTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "recording") void stopRecording(true);
    }, TUTOR.maxHoldMs);
  }

  async function stopRecording(hitMax = false) {
    const rec = recRef.current;
    if (!rec || phaseRef.current !== "recording") return;
    clearMaxTimer();
    setPhase("stopping");
    try {
      const { pcm, durationMs } = await rec.stop(TUTOR.tailMs);
      setLevel(0);
      if (durationMs < TUTOR.minHoldMs || pcm.length === 0) {
        setNote(`Too short (${Math.round(durationMs)} ms, minimum ${TUTOR.minHoldMs} ms). Discarded; record again.`);
        setPhase("idle");
        return;
      }
      const url = URL.createObjectURL(new Blob([encodeWav(pcm, TUTOR.sampleRate)], { type: "audio/wav" }));
      takeUrlRef.current = url;
      setTake({ pcm, durationMs, url });
      if (hitMax) setNote(`Stopped at the ${TUTOR.maxHoldMs / 1000} s limit.`);
      setPhase("recorded");
    } catch (err) {
      setLevel(0);
      setNote(`Recording failed (${err instanceof Error ? err.message : String(err)}). Try again.`);
      setPhase("idle");
    }
  }

  function toggle() {
    if (!current) return;
    const p = phaseRef.current;
    if (p === "recording") void stopRecording();
    else if (p === "idle" || p === "recorded") void startRecording();
  }

  function goTo(i: number) {
    if (phaseRef.current !== "idle" && phaseRef.current !== "recorded") return;
    clearTake();
    setNote(null);
    setPhase("idle");
    setIndex(Math.max(0, Math.min(sentences.length, i)));
  }

  function saveAndNext() {
    if (!take || !current || !readerId) return;
    const blob = new Blob([encodeWav(take.pcm, TUTOR.sampleRate)], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${readerId}__${current.id}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaved((s) => (s.includes(current.id) ? s : [...s, current.id]));
    goTo(index + 1);
  }

  function loadSentences(list: Sentence[]) {
    if (phaseRef.current !== "idle" && phaseRef.current !== "recorded") return;
    clearTake();
    setNote(null);
    setLoadError(null);
    setPhase("idle");
    setSentences(list);
    setIndex(0);
    setSaved([]);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      loadSentences(parseSentences(JSON.parse(await file.text())));
    } catch (err) {
      setLoadError(`Could not load ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Space toggles recording, except while typing in a field.
  useEffect(() => {
    toggleRef.current = toggle;
  });
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isField(e.target)) return;
      e.preventDefault(); // no page scroll, no click on a focused button
      if (!e.repeat) toggleRef.current();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isField(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      takeUrlRef.current = null;
      try {
        recRef.current?.dispose();
      } catch {
        // ignore
      }
      recRef.current = null;
      initedRef.current = false;
    };
  }, []);

  const busy = phase === "starting" || phase === "stopping";
  const recording = phase === "recording";

  return (
    <section className="space-y-4 rounded border border-gray-300 p-4">
      <h2 className="text-lg font-semibold">Pass B recorder</h2>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Reader
          <input
            className="rounded border border-gray-400 px-2 py-1"
            value={reader}
            onChange={(e) => setReader(e.target.value)}
            placeholder="karthik"
          />
        </label>
        <label className="flex items-center gap-2">
          Sentences JSON
          <input type="file" accept=".json,application/json" onChange={onFile} disabled={recording || busy} />
        </label>
        <button className={btn} onClick={() => loadSentences(DEV_SENTENCES)} disabled={recording || busy}>
          Load 3 dev sentences
        </button>
      </div>
      {reader && !readerId && <p className="text-sm text-red-600">Reader name needs letters or digits.</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {micError && (
        <p role="alert" className="rounded border border-red-400 p-2 text-sm text-red-700">
          {micError}
        </p>
      )}

      {sentences.length === 0 && <p className="text-sm text-gray-600">Load a sentences file to begin.</p>}

      {current && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Sentence {index + 1} of {sentences.length} · id <code>{current.id}</code>
            {saved.includes(current.id) && " · already saved"}
          </p>
          <p className="text-3xl leading-snug" lang="es">
            {current.text}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`rounded px-4 py-2 font-semibold text-white disabled:opacity-40 ${recording ? "bg-red-600" : "bg-gray-800"}`}
              onClick={toggle}
              disabled={busy}
            >
              {recording ? "Stop" : take ? "Re-record" : "Record"} (Space)
            </button>
            <div className="h-3 w-40 overflow-hidden rounded bg-gray-200" aria-hidden>
              <div className="h-full bg-green-600" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <span className="text-sm">
              {phase === "starting" && "Waiting for the microphone…"}
              {recording && <span className="text-red-600">● recording…</span>}
              {phase === "stopping" && "Finishing…"}
            </span>
          </div>

          {note && <p className="text-sm text-amber-700">{note}</p>}

          {take && phase === "recorded" && (
            <div className="space-y-2">
              <p className="text-sm">Duration: {(take.durationMs / 1000).toFixed(2)} s</p>
              <audio controls src={take.url} />
              <div className="flex flex-wrap items-center gap-3">
                <button className={`${btn} font-semibold`} onClick={saveAndNext} disabled={!readerId}>
                  Save &amp; next
                </button>
                {!readerId && <span className="text-sm text-red-600">Enter a reader name to save.</span>}
                {readerId && (
                  <span className="text-sm text-gray-600">
                    downloads <code>{`${readerId}__${current.id}.wav`}</code>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button className={btn} onClick={() => goTo(index - 1)} disabled={index === 0 || recording || busy}>
              Back
            </button>
            <button className={btn} onClick={() => goTo(index + 1)} disabled={recording || busy}>
              Skip
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div className="space-y-2">
          <p className="font-semibold">
            End of the list. Saved {saved.length} of {sentences.length}.
          </p>
          <button className={btn} onClick={() => goTo(0)}>
            Back to the first sentence
          </button>
        </div>
      )}

      {sentences.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {sentences.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <button
                className={`rounded border px-2 py-0.5 ${i === index ? "border-gray-800 font-semibold" : "border-gray-300"} ${
                  saved.includes(s.id) ? "bg-green-100" : ""
                }`}
                onClick={() => goTo(i)}
                disabled={recording || busy}
              >
                {s.id} {saved.includes(s.id) ? "saved" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-600">
        Move the downloaded files to eval/stt-test/audio/B/&lt;reader&gt;/&lt;id&gt;.wav (never commit them).
      </p>
    </section>
  );
}
