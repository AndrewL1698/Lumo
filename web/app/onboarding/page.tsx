"use client";
import { Settings } from "@parrot/shared";
import { useState } from "react";
import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/settings", Settings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(s: Settings) {
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
      <PageHeader title="Welcome to Parrot" subtitle="Two quick steps: tell us your level, then pair the Chrome extension." />
      {loading && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && <OnboardingForm initial={data} onSubmit={save} />}
      {saveError && <ErrorState message={saveError} />}
      {saved && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-green-800">
          Saved! Next, open the Parrot popup on a news site and click Enable (try BBC or Wikipedia), or{" "}
          <Link href="/tutor" className="font-semibold underline">
            talk to the tutor
          </Link>
          .
        </p>
      )}
    </>
  );
}
