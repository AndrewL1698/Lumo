import type { Recap } from "@parrot/shared";
import { btn } from "@/components/ui/PageHeader";

const label = "font-display text-xl font-semibold text-ink";

export function RecapPanel({ recap, onClose }: { recap: Recap; onClose?: () => void }) {
  return (
    <section className="space-y-8">
      <div className="border-b border-line pb-6">
        <h2 className="text-3xl font-bold tracking-tight">Session recap</h2>
        {recap.summary_en && <p className="mt-3 max-w-2xl text-lg text-muted">{recap.summary_en}</p>}
      </div>

      <div>
        <h3 className={label}>Mistakes to watch</h3>
        {recap.topErrors.length === 0 ? (
          <p className="mt-3 text-muted">No repeated mistakes this session.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {recap.topErrors.map((e, i) => (
              <li key={i} className="py-3">
                <p className="text-lg">
                  <s className="text-stop decoration-stop">{e.span}</s>
                  <span className="mx-2 text-muted">→</span>
                  <span className="font-bold text-go">{e.correction}</span>
                  {e.count > 1 && <span className="ml-3 text-sm text-muted">{e.count} times</span>}
                </p>
                <p className="mt-1 text-muted">{e.explanation_en}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recap.tips.length > 0 && (
        <div>
          <h3 className={label}>Tips</h3>
          <ul className="mt-3 space-y-2">
            {recap.tips.map((t, i) => (
              <li key={i} className="text-ink">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-8 border-t border-line pt-6 md:grid-cols-2">
        <div>
          <h3 className={label}>Now in your vocabulary</h3>
          <p className={`mt-2 text-lg ${recap.wordsNowKnown.length ? "text-go" : "text-muted"}`}>
            {recap.wordsNowKnown.length ? recap.wordsNowKnown.join(", ") : "No new words yet. Use a target word correctly to earn one."}
          </p>
        </div>
        <div>
          <h3 className={label}>Review tomorrow</h3>
          <p className={`mt-2 text-lg ${recap.reviewTomorrow.length ? "text-wait" : "text-muted"}`}>
            {recap.reviewTomorrow.length ? recap.reviewTomorrow.join(", ") : "Nothing due."}
          </p>
        </div>
      </div>

      {onClose && (
        <button type="button" onClick={onClose} className={btn.primary}>
          Start a new session
        </button>
      )}
    </section>
  );
}
