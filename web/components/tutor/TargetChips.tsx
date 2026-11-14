import type { TargetWord } from "../../lib/tutor/types";

export function TargetChips({ words, known = [] }: { words: TargetWord[]; known?: string[] }) {
  if (words.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-600">Try to use these words today</p>
      <ul className="flex flex-wrap gap-2">
        {words.map((w) => {
          const done = known.includes(w.lemma);
          return (
            <li
              key={w.lemma}
              className={`rounded-full border px-3 py-1 text-sm ${
                done ? "border-green-400 bg-green-50 text-green-800" : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {done ? "✓ " : ""}
              {w.article ? `${w.article} ` : ""}
              <strong>{w.lemma}</strong>
              <span className="text-slate-500"> · {w.english}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
