"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/tutor", label: "Tutor" },
  { href: "/vocabulary", label: "Vocabulary" },
  { href: "/privacy", label: "What Parrot knows" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-ink">
          Parrot
        </Link>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`transition-colors duration-150 ${
                    active ? "text-ink underline decoration-1 underline-offset-[10px]" : "text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
