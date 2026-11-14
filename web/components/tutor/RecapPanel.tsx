import type { Recap } from "@parrot/shared";

export function RecapPanel({ recap, onClose }: { recap: Recap; onClose?: () => void }) {
  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">Session recap</h2>
      {recap.summary_en && <p className="text-slate-700">{recap.summary_en}</p>}

      <div>
        <h3 className="mb-2 font-semibold text-slate-900">Mistakes to watch</h3>
        {recap.topErrors.length === 0 ? (
          <p className="text-sm text-slate-500">No repeated mistakes this session. Nice work.</p>
        ) : (
          <ul className="space-y-2">
            {recap.topErrors.map((e, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-4 py-2">
                <span className="text-red-700 line-through">{e.span}</span> →{" "}
                <span className="font-semibold text-green-700">{e.correction}</span>
                {e.count > 1 && <span className="ml-2 text-xs text-slate-500">×{e.count}</span>}
                <p className="text-sm text-slate-600">{e.explanation_en}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recap.tips.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-slate-900">Quick tips</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            {recap.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold text-slate-900">Now in your vocabulary</h3>
          {recap.wordsNowKnown.length ? (
            <p className="text-green-800">{recap.wordsNowKnown.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-500">No new words yet. Use a target word correctly to earn one.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-slate-900">Review tomorrow</h3>
          {recap.reviewTomorrow.length ? (
            <p className="text-slate-800">{recap.reviewTomorrow.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-500">Nothing due.</p>
          )}
        </div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700">
          Start a new session
        </button>
      )}
    </section>
  );
}
