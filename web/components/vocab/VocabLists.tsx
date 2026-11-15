import type { VocabItem, VocabResponse } from "@parrot/shared";

// The same words as the jar, as a readable list grouped by how brightly they glow. No boxes.
const GROUPS: { key: "known" | "learning" | "mastered"; title: string }[] = [
  { key: "known", title: "Glowing steady" },
  { key: "learning", title: "Still faint" },
  { key: "mastered", title: "Shining bright" },
];

const isDue = (w: VocabItem) => !!w.dueAt && new Date(w.dueAt).getTime() <= Date.now();

export function StreakBadge({ days }: { days: number }) {
  return (
    <p className="text-lg text-muted">
      {days > 0 ? (
        <>
          <span className="font-display text-3xl font-extrabold text-ink">{days}</span> {days === 1 ? "night" : "nights"} in a row
        </>
      ) : (
        "No streak yet. Practise tonight to start one."
      )}
    </p>
  );
}

export function VocabLists({ data, fresh = new Set<string>() }: { data: VocabResponse; fresh?: Set<string> }) {
  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-3">
      {GROUPS.map(({ key, title }) => {
        const words = [...data[key]].sort((a, b) => Number(fresh.has(b.lemma)) - Number(fresh.has(a.lemma)));
        return (
          <section key={key}>
            <h2 className="flex items-center gap-3 text-xl font-extrabold">
              <span className="jar-legend grid h-6 w-6 place-items-center rounded-full bg-jar" data-level={key} aria-hidden="true">
                <span className="jar-light" />
              </span>
              {title}
              <span className="font-sans text-base font-normal text-muted">{data.counts[key]}</span>
            </h2>
            {words.length === 0 ? (
              <p className="mt-3 text-muted">
                {key === "known"
                  ? "None yet. Say a word correctly in a lesson and it lights up here."
                  : key === "learning"
                    ? "None yet. Hover a Spanish word while reading to catch one."
                    : "None yet. Words you keep remembering for weeks end up here."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {words.map((w) => (
                  <li key={w.lemma} className="flex items-baseline gap-2">
                    <span className={`text-lg font-bold ${fresh.has(w.lemma) ? "glow-known" : ""}`}>
                      {w.article && <span className="font-normal text-muted">{w.article} </span>}
                      {w.lemma}
                    </span>
                    <span className="text-muted">{w.english}</span>
                    {key !== "mastered" && isDue(w) && (
                      <span className="ml-auto inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full border-2 border-accent" title="Up for review">
                        <span className="sr-only">Up for review</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
