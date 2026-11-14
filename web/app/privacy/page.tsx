"use client";
import { DataDeleteResponse, DataResponse, type DataDeleteRequest } from "@parrot/shared";
import { KnownData } from "@/components/privacy/KnownData";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload } = useFetch("/api/data", DataResponse, { refetchOnFocus: true });

  // Only report success after the server confirms, then refetch so the screen matches the database.
  async function onDelete(req: DataDeleteRequest): Promise<boolean> {
    try {
      const res = await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) return false;
      DataDeleteResponse.parse(await res.json());
    } catch {
      return false;
    }
    // The route is real now: refetch so the list shows exactly what the database holds.
    await reload();
    return true;
  }

  return (
    <>
      <PageHeader title="What Parrot knows" subtitle="Everything Parrot has stored about you, with a delete button for each item." />
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && <KnownData data={data} onDelete={onDelete} />}
    </>
  );
}
