import { READING_SITES } from "@parrot/shared";

// The web app can't grant site access (architecture §11 #4): Chrome only lets the extension ask, from its popup.
// So this explains how to turn on the sites chosen in the previous step (D-021).
const nameOf = (origin: string) =>
  READING_SITES.find((s) => s.origin === origin)?.name ?? origin.replace(/^https?:\/\//, "");

export function ReadingSites({ allowlist = [] }: { allowlist?: string[] }) {
  return (
    <section className="rounded-sm border border-line bg-panel p-5">
      <h2 className="text-xl font-bold text-ink">Turn Luci on for your sites</h2>
      <p className="mt-1 text-sm text-muted">
        Luci does nothing on a site until you turn it on there. Chrome asks you to confirm, once.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink">
        <li>Pair the extension with the code above.</li>
        <li>Click the Luci icon in Chrome&apos;s toolbar.</li>
        <li>
          Click <strong>Turn on your sites</strong> (or <strong>Always on for this site</strong> on
          each one), then allow Chrome&apos;s prompt.
        </li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        On other good reading sites, Luci&apos;s icon shows a small dot. Click it to add that site
        too.
      </p>
      {allowlist.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Your sites ({allowlist.length}):{" "}
          <span className="font-medium text-ink">{allowlist.map(nameOf).join(", ")}</span>
        </p>
      )}
      <p className="mt-4 text-xs text-muted">
        Luci never runs on email, chat, banking, health, school or work tools, or login pages, even
        if you enable them.
      </p>
    </section>
  );
}
