"use client";

export function ReadingToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-indigo-600"
      />
      <span>
        <span className="block text-lg font-semibold text-slate-900">Use my reading in tutor lessons</span>
        <span className="mt-1 block text-sm text-slate-600">
          The tutor can chat about articles you read and words you hovered; only titles and domains are
          stored, never page text or URLs.
        </span>
      </span>
    </label>
  );
}
