"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuciMark } from "@/components/LuciMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSetupStatus } from "@/components/settings/useSetupStatus";

const LINKS = [
  { href: "/tutor", label: "Tutor" },
  { href: "/progress", label: "Your course" },
  { href: "/vocabulary", label: "Your jar" },
  { href: "/privacy", label: "What Luci knows" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const setup = useSetupStatus();
  const needsSetup = setup !== null && !setup.complete;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel">
      <nav className="mx-auto flex max-w-5xl items-center gap-x-5 px-4 py-4 sm:gap-x-8">
        <Link href="/" className="nav-home flex shrink-0 items-center gap-2 rounded-sm font-display text-xl font-extrabold tracking-tight text-ink">
          <LuciMark size={30} />
          Luci
        </Link>
        <ul className="-mb-3 flex min-w-0 gap-x-4 overflow-x-auto whitespace-nowrap pb-3 [scrollbar-width:none] sm:gap-x-6">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link ${active ? "text-ink" : "text-muted hover:text-ink focus-visible:text-ink"}`}
                >
                  {l.label}
                  {l.href === "/settings" && needsSetup && (
                    <>
                      <span className="setup-dot" aria-hidden="true" />
                      <span className="sr-only"> (setup not finished)</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <ThemeToggle />
      </nav>
    </header>
  );
}
