"use client";
import { useState } from "react";
import { MOCK_PAIRING_CODE, MOCK_SETTINGS } from "../../lib/mocks";
import type { SettingsMock } from "../../lib/mocks/types";
import { LevelPicker } from "./LevelPicker";
import { PairingCode } from "./PairingCode";
import { ReadingToggle } from "./ReadingToggle";

// TODO(demo): onSubmit should PUT /api/settings; defaults to a console.log under mocks.
export function OnboardingForm({
  initial = MOCK_SETTINGS,
  pairingCode = MOCK_PAIRING_CODE,
  onSubmit = (s: SettingsMock) => console.log("onboarding settings", s),
}: {
  initial?: SettingsMock;
  pairingCode?: string;
  onSubmit?: (s: SettingsMock) => void;
}) {
  const [level, setLevel] = useState(initial.level);
  const [useReading, setUseReading] = useState(initial.useReadingInLessons);
  return (
    <div className="space-y-6">
      <LevelPicker value={level} onChange={setLevel} />
      <ReadingToggle checked={useReading} onChange={setUseReading} />
      <PairingCode code={pairingCode} />
      <button
        type="button"
        onClick={() => onSubmit({ ...initial, level, useReadingInLessons: useReading })}
        className="rounded-lg bg-indigo-600 px-6 py-3 text-lg font-semibold text-white hover:bg-indigo-700"
      >
        Save and continue
      </button>
    </div>
  );
}
