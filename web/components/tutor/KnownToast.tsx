"use client";
import { useEffect } from "react";

// "Word is now known" notice. Pass a lemma from newlyKnown(wordUpdates).
export function KnownToast({
  lemma,
  onDone,
  durationMs = 5000, // long enough to point at on camera
}: {
  lemma: string | null;
  onDone: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!lemma) return;
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [lemma, onDone, durationMs]);

  if (!lemma) return null;
  // Near the top (the talk controls own the bottom). It enters once; that motion marks a real event.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-24 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-go bg-bg px-6 py-4 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:-translate-y-2 starting:opacity-0"
    >
      <p className="font-mono text-xs uppercase tracking-wider text-go">Now known</p>
      <p className="mt-1 text-3xl font-bold text-ink">{lemma}</p>
      <p className="mt-1 text-muted">Used correctly out loud. Added to your vocabulary.</p>
    </div>
  );
}
