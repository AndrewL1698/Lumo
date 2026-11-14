import type { VocabItem, VocabResponse } from "@parrot/shared";

// Luci's glow = word state (docs/brand/README.md). Learning glows faintly; known and mastered glow steady.
// Only saying a word correctly out loud can make it glow steady.
const LISTS: { key: "learning" | "known" | "mastered"; title: string; note: string; glow: string; empty: string }[] = [
  {
    key: "learning",
    title: "Learning now",
    note: "Faint glow. Say it out loud to light it up.",
    glow: "glow-learning",
    empty: "No words in progress yet. Hover a Spanish word while reading to start one.",
  },
  {
    key: "known",
    title: "Your vocabulary",
    note: "Steady light. You used these correctly out loud.",
    glow: "glow-known",
    empty: "Nothing here yet. Use a word correctly in a tutor conversation and it lights up here.",
  },
  {
    key: "mastered",
    title: "Mastered",
    note: "Still glowing after weeks of reviews.",
    glow: "glow-known",
    empty: "No mastered words yet. Words you keep remembering over weeks show up here.",
  },
];

// "due now" / "due tomorrow" / "due in 5 days" / "" for null.
function dueLabel(dueAt: string | null, now = Date.now()): string {
  if (!dueAt) return "";
  const days = Math.ceil((new Date(dueAt).getTime() - now) / 86_400_000);
  if (days <= 0) return "up for review";
  if (days === 1) return "review tomorrow";
  if (days > 60) return `review in about ${Math.round(days / 30)} months`;
  return `review in ${days} days`;
}

function WordRow({ w, glow, fresh, showDue = true }: { w: VocabItem; glow: string; fresh?: boolean; showDue?: boolean }) {
  const due = showDue ? dueLabel(w.dueAt) : "";
  return (
    <li
      className={`flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-0 ${
        fresh ? "-mx-3 rounded-sm border border-sun-line bg-sun px-3 last:border" : ""
      }`}
    >
      <span className="text-lg">
        {w.article ? <span className="text-muted">{w.article} </span> : null}
        <span className={`font-bold text-ink ${glow}`}>{w.lemma}</span>
        {fresh && <span className="ml-3 text-xs font-bold uppercase tracking-[0.08em] text-accent">Just lit</span>}
      </span>
      <span className="text-right text-muted">
        {w.english}
        {due && <span className={`block text-xs ${due === "up for review" ? "font-bold text-accent" : ""}`}>{due}</span>}
      </span>
    </li>
  );
}

export function StreakBadge({ days }: { days: number }) {
  return (
    <p className="text-muted">
      {days > 0 ? (
        <>
          <span className="font-display text-2xl font-extrabold text-ink">{days}</span> {days === 1 ? "night" : "nights"} in a row
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
        {LISTS.map(({ key, title, note, glow, empty }) => {
          // Just-learned words go first so they are visible without scrolling.
          const words = [...data[key]].sort((a, b) => Number(fresh.has(b.lemma)) - Number(fresh.has(a.lemma)));
          return (
            <section key={key} className="bg-panel px-5 pb-3 pt-5">
              <div className="border-b border-line pb-3">
                <h2 className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-ink">{title}</span>
                  <span className="font-display text-2xl font-extrabold text-ink">{data.counts[key]}</span>
                </h2>
                <p className="mt-1 text-sm text-muted">{note}</p>
              </div>
              {words.length === 0 ? (
                <p className="py-4 text-muted">{empty}</p>
              ) : (
                <ul>
                  {words.map((w) => (
                    <WordRow
                      key={w.lemma}
                      w={w}
                      glow={glow}
                      fresh={key === "known" && fresh.has(w.lemma)}
                      showDue={key !== "mastered"}
                    />
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
