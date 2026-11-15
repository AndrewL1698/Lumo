"use client";

// Push to talk (default) or hands-free (D-023). Two plain buttons, one pressed.
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: "ptt" | "handsfree";
  onChange: (m: "ptt" | "handsfree") => void;
}) {
  const btn = (m: "ptt" | "handsfree", label: string) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      className={`px-3 py-1 text-sm font-bold transition-colors duration-150 ${
        mode === m ? "bg-ink text-bg" : "bg-panel text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="inline-flex overflow-hidden rounded-sm border border-line" role="group" aria-label="Talking mode">
        {btn("ptt", "Push to talk")}
        {btn("handsfree", "Hands-free")}
      </span>
      {mode === "handsfree" && <span>Headphones work best.</span>}
    </div>
  );
}
