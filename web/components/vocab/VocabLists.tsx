import type { VocabItem, VocabResponse } from "@parrot/shared";

// Colour is a verdict: learning waits (amber), known is a go (green). Mastered stays neutral.
const LISTS: { key: "learning" | "known" | "mastered"; title: string; tone: string; empty: string }[] = [
  { key: "learning", title: "Learning now", tone: "text-wait", empty: "No words in progress yet. Hover a Spanish word while reading to start one." },
  { key: "known", title: "Your vocabulary", tone: "text-go", empty: "Nothing here yet. Use a word correctly in a tutor conversation and it lands here." },
  { key: "mastered", title: "Mastered", tone: "text-ink", empty: "No mastered words yet. Words you keep remembering over weeks show up here." },
];

// "due now" / "due tomorrow" / "due in 5 days" / "" for null.
function dueLabel(dueAt: string | null, now = Date.now()): string {
  if (!dueAt) return "";
  const days = Math.ceil((new Date(dueAt).getTime() - now) / 86_400_000);
  if (days <= 0) return "due now";
  if (days === 1) return "due tomorrow";
  if (days > 60) return `due in about ${Math.round(days / 30)} months`;
  return `due in ${days} days`;
}

function WordRow({ w, fresh, showDue = true }: { w: VocabItem; fresh?: boolean; showDue?: boolean }) {
  const due = showDue ? dueLabel(w.dueAt) : "";
  return (
    <li
      className={`flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-0 ${
        fresh ? "-mx-3 rounded-xs border border-go bg-go/10 px-3 last:border" : ""
      }`}
    >
      <span className="text-lg">
        {w.article ? <span className="text-muted">{w.article} </span> : null}
        <span className="font-bold text-ink">{w.lemma}</span>
        {fresh && <span className="ml-3 font-mono text-xs uppercase tracking-wider text-go">Just learned</span>}
      </span>
      <span className="text-right text-muted">
        {w.english}
        {due && <span className="block font-mono text-xs">{due}</span>}
      </span>
    </li>
  );
}

export function StreakBadge({ days }: { days: number }) {
  return (
    <p className="font-mono text-sm text-muted">
      {days > 0 ? (
        <>
          Streak <span className="text-ink">{days}</span> {days === 1 ? "day" : "days"}
        </>
      ) : (
        "No streak yet. Practise today to start one."
      )}
    </p>
  );
}

export function VocabLists({ data, fresh = new Set<string>() }: { data: VocabResponse; fresh?: Set<string> }) {
  return (
    <div className="space-y-6">
      <StreakBadge days={data.streakDays} />
      <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
        {LISTS.map(({ key, title, tone, empty }) => {
          // Just-learned words go first so they are visible without scrolling.
          const words = [...data[key]].sort((a, b) => Number(fresh.has(b.lemma)) - Number(fresh.has(a.lemma)));
          return (
            <section key={key} className="bg-bg px-5 pb-3 pt-5">
              <h2 className="flex items-baseline justify-between border-b border-line pb-3">
                <span className="text-lg font-bold text-ink">{title}</span>
                <span className={`font-mono text-lg ${tone}`}>{data.counts[key]}</span>
              </h2>
              {words.length === 0 ? (
                <p className="py-4 text-muted">{empty}</p>
              ) : (
                <ul>
                  {words.map((w) => (
                    <WordRow key={w.lemma} w={w} fresh={key === "known" && fresh.has(w.lemma)} showDue={key !== "mastered"} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
