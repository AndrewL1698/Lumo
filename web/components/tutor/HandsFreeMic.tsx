"use client";
import type { TutorStatus } from "@/app/tutor/session";

const STATUS: Record<TutorStatus, string> = {
  idle: "Listening. Just talk.",
  listening: "You're talking",
  checking: "Lumo is thinking",
  speaking: "Lumo is talking. Speak up to interrupt.",
};

// Hands-free (D-023): the mic stays open and Luci listens for you. The only control is mute.
export function HandsFreeMic({
  status,
  muted,
  onToggleMute,
}: {
  status: TutorStatus;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-5 sm:flex-none">
      <button
        type="button"
        onClick={onToggleMute}
        aria-pressed={muted}
        className={`h-16 flex-1 select-none rounded-sm px-6 text-xl font-bold transition-colors duration-150 sm:min-w-56 sm:flex-none sm:px-8 ${
          muted ? "border border-stop/50 bg-panel text-stop hover:border-stop" : "bg-ink text-bg hover:bg-ink/85"
        }`}
      >
        {muted ? "Mic muted. Tap to unmute" : status === "listening" ? "Listening…" : "Mic on. Tap to mute"}
      </button>
      <p className={`sr-only text-sm sm:not-sr-only ${!muted && status === "listening" ? "text-accent" : "text-muted"}`} aria-live="polite">
        {muted ? "Muted. Lumo can't hear you." : STATUS[status]}
      </p>
    </div>
  );
}
