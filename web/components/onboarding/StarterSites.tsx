"use client";
import { READING_SITE_GROUPS, READING_SITES } from "@parrot/shared";
import { useState } from "react";
import { btn } from "@/components/ui/PageHeader";

const STARTERS = READING_SITES.filter((s) => s.starter);
const STARTER_ORIGINS = new Set(STARTERS.map((s) => s.origin));

// The allowlist to save: the checked starter sites, plus anything already on the list that isn't a starter
// site (so unchecking a starter removes it, and sites added elsewhere are never dropped).
export function starterAllowlist(
  checked: ReadonlySet<string>,
  current: readonly string[],
): string[] {
  const others = current.filter((o) => !STARTER_ORIGINS.has(o));
  return [...STARTERS.map((s) => s.origin).filter((o) => checked.has(o)), ...others];
}

// Onboarding step 3 (D-021): pick reading sites from a starter list, all checked by default.
// The web app only saves the choice; the extension asks Chrome for access to all of them in one prompt.
export function StarterSites({
  allowlist,
  busy,
  onSave,
}: {
  allowlist: string[];
  busy: boolean;
  onSave: (allowlist: string[]) => void;
}) {
  // First visit: everything checked. Coming back: keep what was saved.
  const [checked, setChecked] = useState<Set<string>>(() => {
    const saved = STARTERS.filter((s) => allowlist.includes(s.origin));
    return new Set((saved.length > 0 ? saved : STARTERS).map((s) => s.origin));
  });
  const toggle = (origin: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(origin)) next.add(origin);
      return next;
    });
  const allOn = checked.size === STARTERS.length;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink">Where should Lumo work?</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A starter list of sites people read every day. Uncheck any you don&apos;t want. Lumo stays
          off everywhere else until you turn it on. Lumo is tuned for NPR; other sites are best
          effort.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
        <p className="font-mono text-sm text-muted" aria-live="polite">
          {checked.size} of {STARTERS.length} sites
        </p>
        <button
          type="button"
          onClick={() => setChecked(new Set(allOn ? [] : STARTERS.map((s) => s.origin)))}
          className="text-sm text-ink underline"
        >
          {allOn ? "Uncheck all" : "Check all"}
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {READING_SITE_GROUPS.map((group) => (
          <fieldset key={group}>
            <legend className="mb-2 text-sm font-semibold text-ink">{group}</legend>
            <ul className="space-y-1">
              {STARTERS.filter((s) => s.group === group).map((s) => (
                <li key={s.origin}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xs px-2 py-1 hover:bg-panel">
                    <input
                      type="checkbox"
                      checked={checked.has(s.origin)}
                      onChange={() => toggle(s.origin)}
                      className="h-4 w-4 accent-[#ffd23a]"
                    />
                    <span className="text-ink">{s.name}</span>
                    <span className="truncate text-sm text-muted">
                      {new URL(s.origin).host.replace(/^www\./, "")}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => onSave(starterAllowlist(checked, allowlist))}
        className={`${btn.primary} h-12 px-6 text-lg`}
      >
        {checked.size === 0 ? "Continue without sites" : "Save and continue"}
      </button>
    </section>
  );
}
