import Link from "next/link";
import { correctResponseFixture, rawTextFixture } from "@parrot/shared";
import { CorrectionCards } from "@/components/tutor/CorrectionCards";
import { TranscriptView } from "@/components/tutor/TranscriptView";
import { btn } from "@/components/ui/PageHeader";

const STEPS = [
  { title: "Read", body: "On sites you switch on, a few English words turn into Spanish. Hover one for its meaning and sound." },
  { title: "Talk", body: "The tutor opens a Spanish conversation about the article you read, and steers toward the words you looked up." },
  { title: "Prove it", body: "Use a word correctly out loud and it moves to your vocabulary. Seeing a word is never enough." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Spanish speaking practice built from what you read today.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Parrot swaps a few words on the news you already read, then a voice tutor talks with you about that article and marks
            each mistake in your own words.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/tutor" className={`${btn.primary} h-12 w-full px-6 sm:w-auto`}>
              Start a lesson
            </Link>
            <Link href="/onboarding" className={`${btn.secondary} h-12 w-full px-6 sm:w-auto`}>
              Set up Parrot
            </Link>
          </div>
        </div>

        {/* The real correction view, rendered with sample session data. */}
        <div className="rounded-sm border border-line px-6 py-5">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">Sample turn</p>
          <div className="mt-2">
            <TranscriptView raw={rawTextFixture} result={correctResponseFixture.correction} />
          </div>
          <div className="mt-4">
            <CorrectionCards raw={rawTextFixture} result={correctResponseFixture.correction} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="border-b border-line pb-3 text-xl font-bold">How it works</h2>
        <ol className="divide-y divide-line border-b border-line">
          {STEPS.map((s) => (
            <li key={s.title} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-muted">
          Everything Parrot stores is listed on{" "}
          <Link href="/privacy" className="text-ink underline decoration-line transition-colors duration-150 hover:decoration-ink">
            What Parrot knows
          </Link>
          , and you can delete any of it.
        </p>
      </section>
    </div>
  );
}
