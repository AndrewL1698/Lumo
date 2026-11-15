"use client";
import { Settings } from "@parrot/shared";
import { useState } from "react";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { SetupChecklist } from "@/components/settings/SetupChecklist";
import { useSetupStatus } from "@/components/settings/useSetupStatus";
import { saveSettings } from "@/components/settings/saveSettings";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/settings", Settings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const setup = useSetupStatus();

  async function save(s: Settings) {
    setSaved(false);
    setSaveError(null);
    // Only the fields this page edits; the allowlist always comes fresh from the server.
    const r = await saveSettings({
      level: s.level,
      intensity: s.intensity,
      perPageCap: s.perPageCap,
      useReadingInLessons: s.useReadingInLessons,
      pausedSites: s.pausedSites,
    });
    if (r.ok) {
      setSaved(true);
      void reload(); // the checklist shows the saved level and reading choice
    }
    else setSaveError(r.message);
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Get set up, then choose how Lumo works for you." />
      {loading && <LoadingState shape="form" />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && setup && <SetupChecklist settings={data} status={setup} />}
      {data && <SettingsForm initial={data} onSave={save} />}
      {saveError && <div className="mt-4"><ErrorState message={saveError} /></div>}
      {saved && (
        <p role="status" className="mt-6 rounded-sm border border-go px-5 py-4 text-ink">
          Saved.
        </p>
      )}
    </>
  );
}
