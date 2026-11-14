"use client";
import { DataDeleteResponse, DataResponse, type DataDeleteRequest } from "@parrot/shared";
import { KnownData } from "@/components/privacy/KnownData";
import { ErrorState, PageHeader } from "@/components/ui/PageHeader";
import { useFetch } from "@/components/useFetch";

export default function Page() {
  const { data, error, loading, reload, setData } = useFetch("/api/data", DataResponse, { refetchOnFocus: true });

  // Only change the list after the server confirms, so the screen never shows a delete that didn't happen.
  async function onDelete(req: DataDeleteRequest): Promise<boolean> {
    try {
      const res = await fetch("/api/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) return false;
      DataDeleteResponse.parse(await res.json());
    } catch {
      return false;
    }
    // HACK: the stub route ignores the request, so we filter locally instead of refetching.
    setData((d) => {
      if (!d) return d;
      if (req.kind === "all") return { words: [], events: [], articles: [] };
      if (req.kind === "word") return { ...d, words: d.words.filter((w) => w.lemma !== req.lemma) };
      if (req.kind === "event") return { ...d, events: d.events.filter((e) => e.id !== req.id) };
      return { ...d, articles: d.articles.filter((a) => a.id !== req.id) };
    });
    return true;
  }

  return (
    <>
      <PageHeader title="What Parrot knows" subtitle="Everything Parrot has stored about you, with a delete button for each item." />
      {loading && <p className="text-slate-500">Loading…</p>}
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {data && <KnownData data={data} onDelete={onDelete} />}
    </>
  );
}
