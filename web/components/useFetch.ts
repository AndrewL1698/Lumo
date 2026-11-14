"use client";
import { useCallback, useEffect, useState } from "react";

// Fetch a same-origin /api route and validate it with a /shared zod schema. Never throws into the page.
export function useFetch<T>(url: string, schema: { parse: (x: unknown) => T }, opts?: { refetchOnFocus?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(schema.parse(await res.json()));
      setError(null);
    } catch {
      setError("We couldn't load this right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!opts?.refetchOnFocus) return;
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, opts?.refetchOnFocus]);

  return { data, error, loading, reload: load, setData };
}
