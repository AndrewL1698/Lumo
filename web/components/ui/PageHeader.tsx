import type { ReactNode } from "react";

// One button system for the whole app. Primary is the ink-filled action; colour stays reserved for verdicts.
const base =
  "inline-flex items-center justify-center rounded-sm px-4 py-2 font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";
export const btn = {
  primary: `${base} bg-ink text-bg hover:bg-[#c9ced5]`,
  secondary: `${base} border border-line text-ink hover:border-muted`,
  danger: `${base} border border-stop/60 text-stop hover:border-stop hover:bg-stop/10`,
  dangerSolid: `${base} bg-stop text-ink hover:bg-stop/85`,
};

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-sm border border-dashed border-line px-5 py-6 text-muted">{children}</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-sm border border-stop/60 px-5 py-5 text-ink">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${btn.secondary} mt-4`}>
          Try again
        </button>
      )}
    </div>
  );
}

const bar = "animate-pulse rounded-xs bg-line";

// Skeletons shaped like the content they stand in for.
export function LoadingState({ shape = "rows" }: { shape?: "rows" | "columns" | "chips" | "form" }) {
  if (shape === "columns") {
    return (
      <div role="status" aria-label="Loading" className="grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
        {[0, 1, 2].map((c) => (
          <div key={c} className="space-y-4 bg-bg p-5">
            <div className={`${bar} h-5 w-32`} />
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="flex justify-between">
                <div className={`${bar} h-4 w-24`} />
                <div className={`${bar} h-4 w-16`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (shape === "chips") {
    return (
      <div role="status" aria-label="Loading" className="space-y-6">
        <div className={`${bar} h-5 w-64`} />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className={`${bar} h-9`} style={{ width: `${80 + ((i * 37) % 60)}px` }} />
          ))}
        </div>
        {[0, 1, 2].map((r) => (
          <div key={r} className={`${bar} h-12 w-full`} />
        ))}
      </div>
    );
  }
  if (shape === "form") {
    return (
      <div role="status" aria-label="Loading" className="space-y-8">
        {[0, 1, 2].map((s) => (
          <div key={s} className="space-y-3">
            <div className={`${bar} h-5 w-56`} />
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((c) => (
                <div key={c} className={`${bar} h-20`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${bar} h-14 w-full`} />
      ))}
    </div>
  );
}
