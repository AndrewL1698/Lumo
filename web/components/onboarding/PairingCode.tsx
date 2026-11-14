// Static demo code for now (TODO(demo): no endpoint defines one; see docs/plan-shravan.md gap #1).
export function PairingCode({ code }: { code: string }) {
  return (
    <section className="rounded-sm border border-line bg-panel p-5">
      <h2 className="text-xl font-bold text-ink">Pair the Chrome extension</h2>
      <p className="mt-1 text-sm text-muted">
        Open the Luci popup in Chrome and enter this code. You'll also add reading sites there.
      </p>
      <p
        aria-label={`Pairing code ${code.split("").join(" ")}`}
        className="mt-4 inline-block rounded-sm border border-line bg-panel px-6 py-3 font-mono text-4xl font-bold tracking-[0.3em] text-ink"
      >
        {code}
      </p>
    </section>
  );
}
