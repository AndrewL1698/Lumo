"use client";
import { Settings } from "@parrot/shared";
import { useState } from "react";
import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { saveSettings } from "@/components/settings/saveSettings";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/settings", Settings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(s: Settings) {
    setSaveError(null);
    const r = await saveSettings({ level: s.level, useReadingInLessons: s.useReadingInLessons });
    if (r.ok) setSaved(true);
    else setSaveError(r.message);
  }

  return (
    <>
      <PageHeader title="Welcome to Luci" subtitle="Two quick steps: tell us your level, then pair the Chrome extension." />
      {loading && <LoadingState shape="form" />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && <OnboardingForm initial={data} onSubmit={save} />}
      {saveError && <ErrorState message={saveError} />}
      {saved && (
        <p role="status" className="mt-6 rounded-sm border border-go px-5 py-4 text-ink">
          Saved. Next, open the Luci popup on a news site and click Enable (try BBC or Wikipedia), or{" "}
          <Link href="/tutor" className="font-semibold underline">
            talk to the tutor
          </Link>
          .
        </p>
      )}
    </>
  );
}
