import type { TargetWord } from "@parrot/shared";

// Words the tutor will steer toward. A word turns green once it has been used correctly out loud.
export function TargetChips({ words, known = [] }: { words: TargetWord[]; known?: string[] }) {
  if (words.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-line pb-4">
      <p className="font-mono text-xs uppercase tracking-wider text-muted">Target words</p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {words.map((w) => {
          const done = known.includes(w.lemma);
          return (
            <li key={w.lemma} className={done ? "text-go" : "text-ink"}>
              {w.article ? <span className={done ? "" : "text-muted"}>{w.article} </span> : null}
              <strong>{w.lemma}</strong>
              <span className={done ? "" : "text-muted"}> {w.english}</span>
              {done && <span className="ml-2 font-mono text-xs uppercase tracking-wider">used</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
