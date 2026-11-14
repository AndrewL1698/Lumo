import type { VocabItem, VocabResponse } from "@parrot/shared";

const LISTS: { key: "learning" | "known" | "mastered"; title: string; empty: string; tone: string }[] = [
  { key: "learning", title: "Learning now", empty: "No words in progress yet. Hover a Spanish word while reading to start one.", tone: "border-amber-300" },
  { key: "known", title: "Your vocabulary", empty: "Nothing here yet. Use a word correctly in a tutor conversation and it lands here.", tone: "border-green-400" },
  { key: "mastered", title: "Mastered", empty: "No mastered words yet. Words you keep remembering over weeks show up here.", tone: "border-indigo-400" },
];

// "due now" / "due tomorrow" / "due in 5 days" / "" for null.
function dueLabel(dueAt: string | null, now = Date.now()): string {
  if (!dueAt) return "";
  const days = Math.ceil((new Date(dueAt).getTime() - now) / 86_400_000);
  if (days <= 0) return "due now";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

function WordRow({ w, fresh }: { w: VocabItem; fresh?: boolean }) {
  const due = dueLabel(w.dueAt);
  return (
    <li
      className={`flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0 ${
        fresh ? "-mx-2 rounded-lg border-0 bg-green-50 px-2 ring-2 ring-green-400" : ""
      }`}
    >
      <span className="text-lg font-semibold text-slate-900">
        {w.article ? <span className="font-normal text-slate-500">{w.article} </span> : null}
        {w.lemma}
        {fresh && <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 align-middle text-xs font-semibold text-white">just learned</span>}
      </span>
      <span className="text-right text-sm text-slate-600">
        {w.english}
        {due && <span className="block text-xs text-slate-400">{due}</span>}
      </span>
    </li>
  );
}

export function StreakBadge({ days }: { days: number }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-1.5 text-orange-800">
      <span aria-hidden>🔥</span>
      {days > 0 ? `${days}-day streak` : "No streak yet. Practice today to start one."}
    </p>
  );
}

export function VocabLists({ data, fresh = new Set<string>() }: { data: VocabResponse; fresh?: Set<string> }) {
  return (
    <div className="space-y-6">
      <StreakBadge days={data.streakDays} />
      <div className="grid gap-4 md:grid-cols-3">
        {LISTS.map(({ key, title, empty, tone }) => {
          // Just-learned words go first so they are visible without scrolling.
          const words = [...data[key]].sort((a, b) => Number(fresh.has(b.lemma)) - Number(fresh.has(a.lemma)));
          return (
            <section key={key} className={`rounded-xl border-t-4 ${tone} bg-white p-4 shadow-sm`}>
              <h2 className="flex items-baseline justify-between text-xl font-bold text-slate-900">
                {title}
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-700">
                  {data.counts[key]}
                </span>
              </h2>
              {words.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">{empty}</p>
              ) : (
                <ul className="mt-2">
                  {words.map((w) => (
                    <WordRow key={w.lemma} w={w} fresh={key === "known" && fresh.has(w.lemma)} />
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
