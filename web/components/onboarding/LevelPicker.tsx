"use client";
import type { SettingsMock } from "../../lib/mocks/types";

type Level = SettingsMock["level"];

// Descriptions from specs §4.1.
export const LEVELS: { value: Level; title: string; blurb: string }[] = [
  { value: "beginner", title: "Beginner", blurb: "I know some basic words and phrases." },
  { value: "intermediate", title: "Intermediate", blurb: "I can follow simple articles with help." },
  { value: "upper-intermediate", title: "Upper-intermediate", blurb: "I can read most news but miss some words." },
];

export function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xl font-bold text-slate-900">What's your Spanish level?</legend>
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
              className={`rounded-xl border-2 p-4 text-left transition ${
                selected ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <span className="block text-lg font-semibold text-slate-900">{l.title}</span>
              <span className="mt-1 block text-sm text-slate-600">{l.blurb}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
