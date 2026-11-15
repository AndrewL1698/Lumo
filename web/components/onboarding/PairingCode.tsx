"use client";
import { PairCodeResponse, PairStatusResponse } from "@parrot/shared";
import { useEffect, useState } from "react";

const POLL_MS = 2000;

// HACK(demo): fetches a fresh one-time code from GET /api/pair, then polls until the extension uses it.
// If the server can't make one it hands back the static fallback code, which still pairs.
export function PairingCode() {
  const [code, setCode] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/pair", { cache: "no-store" })
      .then(async (r) => PairCodeResponse.parse(await r.json()).code)
      .catch(() => "482913") // HACK(demo): same fallback the route accepts
      .then((c) => alive && setCode(c));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!code || paired) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/pair?code=${code}`, { cache: "no-store" });
        if (PairStatusResponse.parse(await r.json()).paired) setPaired(true);
      } catch {
        // keep polling quietly
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [code, paired]);

  return (
    <section className="rounded-sm border border-line bg-panel p-5">
      <h2 className="text-xl font-bold text-ink">Pair the Chrome extension</h2>
      <p className="mt-1 text-sm text-muted">
        Open the Lumo popup in Chrome and enter this code. It works once and expires in 15 minutes.
      </p>
      {code ? (
        <p
          aria-label={`Pairing code ${code.split("").join(" ")}`}
          className={`mt-4 inline-block rounded-sm border px-6 py-3 font-mono text-4xl font-bold tracking-[0.3em] ${
            paired ? "border-go text-muted line-through" : "border-line bg-panel text-ink"
          }`}
        >
          {code}
        </p>
      ) : (
        <p aria-label="Loading pairing code" className="mt-4 h-[66px] w-72 animate-pulse rounded-sm bg-line" />
      )}
      <p role="status" className="mt-3 text-lg font-semibold text-go">
        {paired ? "✓ Extension paired" : ""}
      </p>
    </section>
  );
}
