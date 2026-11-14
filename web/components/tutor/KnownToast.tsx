"use client";
import { useEffect } from "react";

// "Word is now known" toast. Pass a lemma from newlyKnown(wordUpdates) (lib/tutor/wordUpdates.ts).
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
  // Big and centered near the top: this is a never-cut demo moment, and the talk controls own the bottom.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-2xl bg-green-600 px-8 py-4 text-center text-white shadow-2xl ring-4 ring-green-200"
    >
      <p className="text-2xl font-bold">🎉 “{lemma}” is now in your vocabulary</p>
      <p className="mt-1 text-base text-green-50">You used it correctly out loud.</p>
    </div>
  );
}
