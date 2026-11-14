"use client";
import { Settings } from "@parrot/shared";
import { useState } from "react";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { saveSettings } from "@/components/settings/saveSettings";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/settings", Settings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (r.ok) setSaved(true);
    else setSaveError(r.message);
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Level, swap intensity and reading options." />
      {loading && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && <SettingsForm initial={data} onSave={save} />}
      {saveError && <div className="mt-4"><ErrorState message={saveError} /></div>}
      {saved && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-green-800">
          Saved.
        </p>
      )}
    </>
  );
}
