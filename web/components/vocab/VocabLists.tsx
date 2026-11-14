import type { VocabResponse, VocabWord } from "../../lib/mocks/types";

const LISTS: { key: "learning" | "known" | "mastered"; title: string; empty: string; tone: string }[] = [
  { key: "learning", title: "Learning now", empty: "No words in progress yet. Hover a Spanish word while reading to start one.", tone: "border-amber-300" },
  { key: "known", title: "Your vocabulary", empty: "Nothing here yet. Use a word correctly in a tutor conversation and it lands here.", tone: "border-green-400" },
  { key: "mastered", title: "Mastered", empty: "No mastered words yet. Words you keep remembering over weeks show up here.", tone: "border-indigo-400" },
];

function WordRow({ w }: { w: VocabWord }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-lg font-semibold text-slate-900">
        {w.article ? <span className="font-normal text-slate-500">{w.article} </span> : null}
        {w.lemma}
      </span>
      <span className="text-sm text-slate-600">{w.english}</span>
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

export function VocabLists({ data }: { data: VocabResponse }) {
  return (
    <div className="space-y-6">
      <StreakBadge days={data.streakDays} />
      <div className="grid gap-4 md:grid-cols-3">
        {LISTS.map(({ key, title, empty, tone }) => {
          const words = data[key];
          return (
            <section key={key} className={`rounded-xl border-t-4 ${tone} bg-white p-4 shadow-sm`}>
              <h2 className="flex items-baseline justify-between text-xl font-bold text-slate-900">
                {title}
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-700">
                  {words.length}
                </span>
              </h2>
              {words.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">{empty}</p>
              ) : (
                <ul className="mt-2">
                  {words.map((w) => (
                    <WordRow key={w.lemma} w={w} />
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
