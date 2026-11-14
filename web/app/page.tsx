import Link from "next/link";

const CARDS = [
  { href: "/onboarding", title: "Get set up", blurb: "Pick your level and pair the Chrome extension." },
  { href: "/tutor", title: "Talk to the tutor", blurb: "Practice speaking about what you read today." },
  { href: "/vocabulary", title: "Your vocabulary", blurb: "Words you're learning, know, and have mastered." },
  { href: "/privacy", title: "What Parrot knows", blurb: "See and delete everything Parrot stores about you." },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold text-slate-900">Your morning reading becomes tonight&apos;s conversation lesson.</h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          Parrot swaps a few English words on sites you choose into Spanish, then a voice tutor talks with you about
          what you read and corrects you instantly.
        </p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {CARDS.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-400">
              <span className="text-xl font-bold text-slate-900">{c.title}</span>
              <span className="mt-1 block text-slate-600">{c.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
