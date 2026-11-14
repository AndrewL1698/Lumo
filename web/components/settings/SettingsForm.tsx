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
        <legend className="mb-3 text-xl font-bold text-slate-900">How many Spanish words on pages?</legend>
        <div className="grid gap-3 md:grid-cols-4" role="radiogroup">
          {INTENSITIES.map((i) => (
            <button
              key={i.value}
              type="button"
              role="radio"
              aria-checked={s.intensity === i.value}
              onClick={() => set({ intensity: i.value })}
              className={`rounded-xl border-2 p-4 text-left transition ${
                s.intensity === i.value ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <span className="block text-lg font-semibold text-slate-900">{i.title}</span>
              <span className="mt-1 block text-sm text-slate-600">{i.blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="cap" className="mb-2 block text-xl font-bold text-slate-900">
          Most swaps per page: {s.perPageCap}
        </label>
        <input
          id="cap"
          type="range"
          min={0}
          max={25}
          value={s.perPageCap}
          onChange={(e) => set({ perPageCap: Number(e.target.value) })}
          className="w-full max-w-md accent-indigo-600"
        />
        <p className="text-sm text-slate-600">Parrot never swaps more than this many words on one page. 0 means none.</p>
      </div>

      <ReadingToggle checked={s.useReadingInLessons} onChange={(useReadingInLessons) => set({ useReadingInLessons })} />

      <section>
        <h2 className="mb-2 text-xl font-bold text-slate-900">Paused sites</h2>
        {s.pausedSites.length === 0 ? (
          <p className="text-slate-500">No sites are paused.</p>
        ) : (
          <ul className="space-y-2">
            {s.pausedSites.map((site) => (
              <li key={site} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2">
                <span className="text-slate-900">{site}</span>
                <button
                  type="button"
                  onClick={() => set({ pausedSites: s.pausedSites.filter((x) => x !== site) })}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Resume
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-bold text-slate-900">Sites where Parrot is on</h2>
        {s.allowlist.length === 0 ? (
          <p className="text-slate-500">None yet. Turn Parrot on for a site from the extension popup.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {s.allowlist.map((site) => (
              <li key={site} className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-800">
                {site}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate-500">To add or remove a site, use the Parrot popup in Chrome.</p>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-indigo-600 px-6 py-3 text-lg font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
