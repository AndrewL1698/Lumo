"use client";
import { useState } from "react";
import type { Settings } from "@parrot/shared";
import { LevelPicker } from "./LevelPicker";
import { PairingCode } from "./PairingCode";
import { ReadingSites } from "./ReadingSites";
import { ReadingToggle } from "./ReadingToggle";

// TODO(demo): hard-coded until Karthik picks the demo pairing code (no endpoint gives one yet).
export const DEMO_PAIRING_CODE = "482913";

// The page loads `initial` from GET /api/settings and saves with PUT /api/settings (full object).
export function OnboardingForm({
  initial,
  pairingCode = DEMO_PAIRING_CODE,
  onSubmit,
}: {
  initial: Settings;
  pairingCode?: string;
  onSubmit: (s: Settings) => void;
}) {
  const [level, setLevel] = useState(initial.level);
  const [useReading, setUseReading] = useState(initial.useReadingInLessons);
  return (
    <div className="space-y-6">
      <LevelPicker value={level} onChange={setLevel} />
      <ReadingToggle checked={useReading} onChange={setUseReading} />
      <PairingCode code={pairingCode} />
      <ReadingSites allowlist={initial.allowlist} />
      <button
        type="button"
        onClick={() => onSubmit({ ...initial, level, useReadingInLessons: useReading })}
        className="inline-flex items-center justify-center rounded-sm bg-glow px-6 py-3 text-lg font-bold text-ink transition-colors duration-150 hover:bg-[#f2c400] disabled:opacity-40"
      >
        Save and continue
      </button>
    </div>
  );
}
