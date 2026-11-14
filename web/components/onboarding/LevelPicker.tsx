"use client";
import type { Level } from "@parrot/shared";

// Descriptions from specs §4.1.
export const LEVELS: { value: Level; title: string; blurb: string }[] = [
  { value: "beginner", title: "Beginner", blurb: "I know some basic words and phrases." },
  { value: "intermediate", title: "Intermediate", blurb: "I can follow simple articles with help." },
  { value: "upper_intermediate", title: "Upper-intermediate", blurb: "I can read most news but miss some words." },
];

export function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xl font-bold text-ink">What's your Spanish level?</legend>
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup">
        {LEVELS.map((l) => {
          const selected = l.value === value;
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(l.value)}
              className={`rounded-sm border p-4 text-left transition-colors duration-150 ${
                selected ? "border-ink bg-panel" : "border-line hover:border-muted"
              }`}
            >
              <span className="block text-lg font-semibold text-ink">{l.title}</span>
              <span className="mt-1 block text-sm text-muted">{l.blurb}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
