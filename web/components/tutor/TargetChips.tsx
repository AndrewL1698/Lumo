import type { TargetWord } from "@parrot/shared";

// Words the tutor will steer toward. They glow faintly until used correctly out loud, then light up.
export function TargetChips({ words, known = [] }: { words: TargetWord[]; known?: string[] }) {
  if (words.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-line pb-4">
      <p className="font-display text-lg font-semibold text-ink">Words to light up</p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {words.map((w) => {
          const done = known.includes(w.lemma);
          return (
            <li key={w.lemma} className="text-ink">
              {w.article ? <span className="text-muted">{w.article} </span> : null}
              <strong className={done ? "glow-known" : "glow-learning"}>{w.lemma}</strong>
              <span className="text-muted"> {w.english}</span>
              {done && <span className="sr-only"> (lit up)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
