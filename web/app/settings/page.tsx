"use client";
import { Settings } from "@parrot/shared";
import { useState } from "react";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/settings", Settings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(s: Settings) {
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Settings.parse(s)), // full object, validated before sending
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
    } catch {
      setSaveError("We couldn't save your settings. Please try again.");
    }
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
