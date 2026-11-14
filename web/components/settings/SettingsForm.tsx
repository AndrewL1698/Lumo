"use client";
import { useState } from "react";
import type { Intensity, Settings } from "@parrot/shared";
import { LevelPicker } from "@/components/onboarding/LevelPicker";
import { ReadingToggle } from "@/components/onboarding/ReadingToggle";

const INTENSITIES: { value: Intensity; title: string; blurb: string }[] = [
  { value: "off", title: "Off", blurb: "No Spanish swaps on pages." },
  { value: "light", title: "Light", blurb: "A few words per page." },
  { value: "normal", title: "Normal", blurb: "A steady mix while you read." },
  { value: "immersion", title: "Immersion", blurb: "As many swaps as we safely can." },
];

export function SettingsForm({ initial, onSave }: { initial: Settings; onSave: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));

  return (
    <form
      className="space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(s);
        setSaving(false);
      }}
    >
      <LevelPicker value={s.level} onChange={(level) => set({ level })} />

      <fieldset>
        <legend className="mb-3 text-xl font-bold text-ink">How many Spanish words on pages?</legend>
        <div className="grid gap-3 md:grid-cols-4" role="radiogroup">
          {INTENSITIES.map((i) => (
            <button
              key={i.value}
              type="button"
              role="radio"
              aria-checked={s.intensity === i.value}
              onClick={() => set({ intensity: i.value })}
              className={`rounded-sm border p-4 text-left transition-colors duration-150 ${
                s.intensity === i.value ? "border-ink bg-panel" : "border-line hover:border-muted"
              }`}
            >
              <span className="block text-lg font-semibold text-ink">{i.title}</span>
              <span className="mt-1 block text-sm text-muted">{i.blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="cap" className="mb-2 block text-xl font-bold text-ink">
          Most swaps per page: {s.perPageCap}
        </label>
        <input
          id="cap"
          type="range"
          min={0}
          max={25}
          value={s.perPageCap}
          onChange={(e) => set({ perPageCap: Number(e.target.value) })}
          className="w-full max-w-md accent-[#e8ebef]"
        />
        <p className="text-sm text-muted">Parrot never swaps more than this many words on one page. 0 means none.</p>
      </div>

      <ReadingToggle checked={s.useReadingInLessons} onChange={(useReadingInLessons) => set({ useReadingInLessons })} />

      <section>
        <h2 className="mb-2 text-xl font-bold text-ink">Paused sites</h2>
        {s.pausedSites.length === 0 ? (
          <p className="text-muted">No sites are paused.</p>
        ) : (
          <ul className="space-y-2">
            {s.pausedSites.map((site) => (
              <li key={site} className="flex items-center justify-between rounded-sm border border-line px-4 py-2">
                <span className="text-ink">{site}</span>
                <button
                  type="button"
                  onClick={() => set({ pausedSites: s.pausedSites.filter((x) => x !== site) })}
                  className="rounded-sm border border-line px-3 py-1 text-sm text-ink transition-colors duration-150 hover:border-muted"
                >
                  Resume
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold text-ink">Sites where Parrot is on</h2>
        {s.allowlist.length === 0 ? (
          <p className="text-muted">None yet. Turn Parrot on for a site from the extension popup.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {s.allowlist.map((site) => (
              <li key={site} className="rounded-xs border border-line px-3 py-1 text-sm text-ink">
                {site}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">To add or remove a site, use the Parrot popup in Chrome.</p>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3 text-lg font-bold text-bg transition-colors duration-150 hover:bg-[#c9ced5] disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
