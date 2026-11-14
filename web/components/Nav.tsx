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
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-2xl font-extrabold text-indigo-600">
          🦜 Parrot
        </Link>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`font-medium ${active ? "text-indigo-700 underline underline-offset-8" : "text-slate-600 hover:text-slate-900"}`}
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
