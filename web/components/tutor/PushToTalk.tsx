"use client";
import { useEffect } from "react";
import type { TutorStatus } from "@/app/tutor/session";

const LABEL: Record<TutorStatus, string> = {
  idle: "Hold to talk",
  listening: "Listening… release to send",
  checking: "Checking your Spanish…",
  speaking: "Tutor is speaking",
};

// Hold the button or the Space bar. Space is ignored while typing in an input.
export function PushToTalk({
  status,
  onPress,
  onRelease,
}: {
  status: TutorStatus;
  onPress: () => void;
  onRelease: () => void;
}) {
  const listening = status === "listening";
  const disabled = status === "checking";

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping(e.target) || disabled) return;
      e.preventDefault();
      onPress();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target) || !listening) return;
      e.preventDefault();
      onRelease();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onPress, onRelease, listening, disabled]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPress();
        }}
        onPointerUp={() => listening && onRelease()}
        aria-pressed={listening}
        className={`h-24 w-24 rounded-full text-4xl shadow-lg transition select-none touch-none ${
          listening ? "scale-110 bg-red-500 text-white" : disabled ? "bg-slate-300 text-slate-500" : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
      >
        🎤
      </button>
      <p className="text-sm font-medium text-slate-700" aria-live="polite">
        {LABEL[status]} {status === "idle" && <span className="text-slate-400">(or hold Space)</span>}
      </p>
    </div>
  );
}
