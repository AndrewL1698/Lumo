import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line pb-14">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted">
        <p>Luci. Built at HackPrinceton Fall 2026.</p>
        <ul className="flex gap-6">
          <li>
            <Link href="/privacy-policy" className="transition-colors duration-150 hover:text-ink">
              Privacy policy
            </Link>
          </li>
          <li>
            <Link href="/terms" className="transition-colors duration-150 hover:text-ink">
              Terms
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
