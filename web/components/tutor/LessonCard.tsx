import type { TutorPlan } from "@parrot/shared";

// J2 "Tonight's lesson": what the tutor planned from your reading and why (built by Andrew's context route,
// no model call). Target words light up here as you use them correctly, like fireflies in the jar.
export function LessonCard({ plan, known, compact = false }: { plan: TutorPlan; known: string[]; compact?: boolean }) {
  return (
    <section aria-label="Tonight's lesson" className={compact ? "space-y-4" : "space-y-4 rounded-md bg-panel px-4 py-4"}>
      {!compact && <h2 className="text-lg font-extrabold">Tonight&apos;s lesson</h2>}

      {plan.article && (
        <div>
          <p className="text-sm text-muted">From your reading</p>
          <p className="font-display text-lg font-semibold leading-snug">{plan.article.title}</p>
          <p className="mt-1 text-sm text-muted">{plan.article.why}</p>
        </div>
      )}

      {plan.words.length > 0 && (
        <div>
          <p className="text-sm text-muted">Words to light up</p>
          <ul className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {plan.words.map((w) => {
              const lit = known.includes(w.lemma);
              return (
                <li key={w.lemma}>
                  <p>
                    <span className={`font-bold ${lit ? "glow-known" : "glow-learning"}`}>{w.lemma}</span>
                    <span className="ml-2 text-muted">{w.english}</span>
                    {lit && <span className="sr-only"> (lit up)</span>}
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-muted">{w.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {plan.watchError && (
        <div>
          <p className="text-sm text-muted">One mistake to watch</p>
          <p className="mt-1 text-ink">{plan.watchError}</p>
        </div>
      )}
    </section>
  );
}
