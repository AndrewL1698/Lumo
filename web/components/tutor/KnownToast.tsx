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
      className="fixed left-1/2 top-24 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-sun-line bg-sun px-6 py-4 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:-translate-y-2 starting:opacity-0"
    >
      <p className="font-display text-lg font-semibold text-accent">Lit up for good</p>
      <p className="mt-2 font-display text-3xl font-extrabold text-ink">
        <span className="glow-known">{lemma}</span>
      </p>
      <p className="mt-2 text-ink">You said it right out loud, so it lights up for good. Your articles get more Spanish on the next reload.</p>
    </div>
  );
}
