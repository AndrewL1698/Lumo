"use client";
import { useEffect } from "react";

// "Word is now known" toast. Pipeline passes the lemma from target_words_used[].correct.
export function KnownToast({
  lemma,
  onDone,
  durationMs = 4000,
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
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-green-600 px-6 py-3 text-lg font-semibold text-white shadow-lg"
    >
      🎉 “{lemma}” is now in your vocabulary
    </div>
  );
}
