"use client";
import { Settings } from "@parrot/shared";
import { useState } from "react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { saveSettings } from "@/components/settings/saveSettings";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/settings", Settings);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(patch: Partial<Settings>): Promise<boolean> {
    setSaveError(null);
    const r = await saveSettings(patch);
    if (!r.ok) setSaveError(r.message);
    return r.ok;
  }

  return (
    <>
      <PageHeader title="Welcome to Luci" subtitle="Three quick steps: tell us your level, let Luci check it, then pair the Chrome extension. No account needed." />
      {loading && <LoadingState shape="form" />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && <OnboardingForm initial={data} onSave={save} />}
      {saveError && <ErrorState message={saveError} />}
    </>
  );
}
