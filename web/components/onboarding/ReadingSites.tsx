// The web app can't grant site access (architecture §11 #4): sites are added from the extension popup,
// where Chrome shows its own permission prompt. So we only explain the steps and suggest sites.
const SUGGESTED = [
  { name: "A news site", example: "bbc.com" },
  { name: "Wikipedia", example: "en.wikipedia.org" },
  { name: "A recipe site", example: "any recipe blog" },
];

export function ReadingSites({ allowlist = [] }: { allowlist?: string[] }) {
  return (
    <section className="rounded-sm border border-line p-5">
      <h2 className="text-xl font-bold text-ink">Choose where Parrot works</h2>
      <p className="mt-1 text-sm text-muted">
        Parrot does nothing until you turn it on for a site, one site at a time. Chrome will ask you to confirm each one.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink">
        <li>Open a site you like to read in Chrome.</li>
        <li>Click the Parrot icon in the toolbar to open the popup.</li>
        <li>Click <strong>Enable</strong>, then allow it in Chrome&apos;s permission prompt.</li>
      </ol>
      <p className="mt-4 text-sm font-medium text-muted">Good places to start</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <li key={s.name} className="rounded-xs border border-line px-3 py-1 text-sm text-ink">
            {s.name} <span className="text-muted">· {s.example}</span>
          </li>
        ))}
      </ul>
      {allowlist.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Already enabled: <span className="font-medium text-ink">{allowlist.join(", ")}</span>
        </p>
      )}
      <p className="mt-4 text-xs text-muted">
        Parrot never runs on email, chat, banking, health, school or work tools, or login pages, even if you enable them.
      </p>
    </section>
  );
}
