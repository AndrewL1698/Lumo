// Static demo code for now (TODO(demo): no endpoint defines one; see docs/plan-shravan.md gap #1).
export function PairingCode({ code }: { code: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-xl font-bold text-slate-900">Pair the Chrome extension</h2>
      <p className="mt-1 text-sm text-slate-600">
        Open the Parrot popup in Chrome and enter this code. You'll also add reading sites there.
      </p>
      <p
        aria-label={`Pairing code ${code.split("").join(" ")}`}
        className="mt-4 inline-block rounded-lg bg-slate-900 px-6 py-3 font-mono text-4xl font-bold tracking-[0.3em] text-white"
      >
        {code}
      </p>
    </section>
  );
}
