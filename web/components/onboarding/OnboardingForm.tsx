"use client";
import { useState } from "react";
import Link from "next/link";
import type { Settings } from "@parrot/shared";
import { btn } from "@/components/ui/PageHeader";
import { LEVELS, LevelPicker } from "./LevelPicker";
import { PairingCode } from "./PairingCode";
import { PlacementCheck } from "./PlacementCheck";
import { ReadingSites } from "./ReadingSites";
import { ReadingToggle } from "./ReadingToggle";

// TODO(demo): hard-coded until Karthik picks the demo pairing code (no endpoint gives one yet).
export const DEMO_PAIRING_CODE = "482913";

const STEPS = ["Your level", "Quick check", "Pair and read"] as const;

// Three steps (D-020): pick a level, let Luci check it in a short voice chat (optional), then pair the extension.
// No account: everything saves to the one built-in profile. `onSave` merges a patch into the saved settings.
export function OnboardingForm({
  initial,
  pairingCode = DEMO_PAIRING_CODE,
  onSave,
}: {
  initial: Settings;
  pairingCode?: string;
  onSave: (patch: Partial<Settings>) => Promise<boolean>;
}) {
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState(initial.level);
  const [useReading, setUseReading] = useState(initial.useReadingInLessons);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i >= step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={i === step ? "font-bold text-ink" : i < step ? "text-ink underline" : "text-muted"}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <LevelPicker value={level} onChange={setLevel} />
          <ReadingToggle checked={useReading} onChange={setUseReading} />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await onSave({ level, useReadingInLessons: useReading })) setStep(1);
              setBusy(false);
            }}
            className={`${btn.primary} h-12 px-6 text-lg`}
          >
            Save and continue
          </button>
        </>
      )}

      {step === 1 && (
        <PlacementCheck
          selfLevel={level}
          onDone={async (picked) => {
            if (picked !== level && (await onSave({ level: picked }))) setLevel(picked);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <>
          <p role="status" className="rounded-sm border border-go px-5 py-4 text-ink">
            Your level is set to <strong>{LEVELS.find((l) => l.value === level)?.title}</strong>. You can change it any
            time in Settings.
          </p>
          <PairingCode code={pairingCode} />
          <ReadingSites allowlist={initial.allowlist} />
          <section className="rounded-sm border border-line bg-panel p-5">
            <h2 className="text-xl font-bold text-ink">Then read, and talk</h2>
            <p className="mt-1 text-sm text-muted">
              Hover a Spanish word on the page to see what it means. Luci saves the words you meet to your jar, with no
              account to create, and the tutor brings them up in conversation.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/tutor" className={btn.primary}>
                Talk to Luci
              </Link>
              <Link href="/vocabulary" className={btn.secondary}>
                Open your jar
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
