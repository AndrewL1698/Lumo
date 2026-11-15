"use client";
import { useEffect, useRef } from "react";
import type { TutorStatus } from "@/app/tutor/session";

const BUTTON: Record<TutorStatus, string> = {
  idle: "Hold to talk",
  listening: "Release to send",
  checking: "Checking",
  speaking: "Hold to talk",
};

const STATUS: Record<TutorStatus, string> = {
  idle: "Ready. Hold the button or the Space bar.",
  listening: "Listening",
  checking: "Checking your Spanish",
  speaking: "Tutor is speaking",
};

// Hold the button or the Space bar. Space is ignored while typing in an input (except an empty data-ptt-space one).
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
  const spaceHeld = useRef(false);

  useEffect(() => {
    // An empty input marked data-ptt-space (the tutor's auto-focused type box) still lets Space mean talk.
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) &&
      !(t instanceof HTMLInputElement && t.hasAttribute("data-ptt-space") && t.value === "");
    // While Space is held for talking, swallow every key-repeat and the keyup, so nothing gets typed
    // into the (auto-focused) type box. spaceHeld is a ref because status may not be "listening" yet.
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (spaceHeld.current) return e.preventDefault();
      if (e.repeat || isTyping(e.target) || disabled) return;
      e.preventDefault();
      spaceHeld.current = true;
      onPress();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const held = spaceHeld.current;
      spaceHeld.current = false;
      if (!held && (isTyping(e.target) || !listening)) return;
      e.preventDefault();
      if (listening) onRelease();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onPress, onRelease, listening, disabled]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-5 sm:flex-none">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPress();
        }}
        onPointerUp={() => listening && onRelease()}
        aria-pressed={listening}
        className={`h-16 flex-1 select-none touch-none rounded-sm px-6 text-xl font-bold sm:min-w-56 sm:flex-none sm:px-8 transition-colors duration-150 ${
          listening
            ? "bg-glow text-ink"
            : disabled
              ? "cursor-not-allowed border border-line text-muted"
              : "bg-ink text-panel hover:bg-[#2f3946]"
        }`}
      >
        {BUTTON[status]}
      </button>
      {/* On phones the button label carries the state; the sentence would stack the bar into a tall block. */}
      <p className={`sr-only text-sm sm:not-sr-only ${listening ? "text-accent" : "text-muted"}`} aria-live="polite">
        {STATUS[status]}
      </p>
    </div>
  );
}
