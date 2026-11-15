"use client";
import { useEffect } from "react";
import type { TutorStatus } from "@/app/tutor/session";

const STATUS: Record<TutorStatus, string> = {
  idle: "Listening. Just talk.",
  listening: "You're talking. Pause and Lumo answers, or tap to send now.",
  checking: "Lumo is thinking",
  speaking: "Lumo is talking. Speak up, or tap Interrupt.",
};

// Hands-free (D-023): the mic stays open and Lumo listens for you. Controls: mute, send now, and interrupt Lumo.
export function HandsFreeMic({
  status,
  muted,
  onToggleMute,
  onSend,
  onInterrupt,
}: {
  status: TutorStatus;
  muted: boolean;
  onToggleMute: () => void;
  onSend: () => void;
  onInterrupt: () => void;
}) {
  const listening = status === "listening" && !muted;
  const canInterrupt = status === "speaking" && !muted;

  // Space interrupts Lumo (never while typing in a box), so it always works even if the listener doesn't hear you.
  useEffect(() => {
    if (!canInterrupt) return;
    const down = (e: KeyboardEvent) => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.code !== "Space" || e.repeat || typing) return;
      e.preventDefault();
      onInterrupt();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [canInterrupt, onInterrupt]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5 sm:flex-none">
      <button
        type="button"
        onClick={listening ? onSend : onToggleMute}
        aria-pressed={muted}
        className={`h-16 flex-1 select-none rounded-sm px-6 text-xl font-bold transition-colors duration-150 sm:min-w-56 sm:flex-none sm:px-8 ${
          listening
            ? "bg-glow text-ink"
            : muted
              ? "border border-stop/50 bg-panel text-stop hover:border-stop"
              : "bg-ink text-bg hover:bg-ink/85"
        }`}
      >
        {listening ? "Listening… tap to send" : muted ? "Mic muted. Tap to unmute" : "Mic on. Tap to mute"}
      </button>
      {canInterrupt && (
        <button
          type="button"
          onClick={onInterrupt}
          className="h-16 shrink-0 select-none rounded-sm border border-line bg-panel px-5 text-lg font-bold text-ink transition-colors duration-150 hover:border-muted"
        >
          Interrupt
        </button>
      )}
      <p className={`sr-only text-sm sm:not-sr-only ${listening ? "text-accent" : "text-muted"}`} aria-live="polite">
        {muted ? "Muted. Lumo can't hear you." : STATUS[status]}
      </p>
    </div>
  );
}
