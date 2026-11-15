import Link from "next/link";
import { correctResponseFixture, rawTextFixture } from "@parrot/shared";
import { Greeting } from "@/components/Greeting";
import { SetupLink } from "@/components/home/SetupLink";
import { CorrectionCards } from "@/components/tutor/CorrectionCards";
import { TranscriptView } from "@/components/tutor/TranscriptView";
import { btn } from "@/components/ui/PageHeader";

// Calm and short: one promise, one picture, three steps. Each step's firefly is brighter than the last
// (seen, learning, known: the same lights as the jar).
const STEPS = [
  {
    level: "seen",
    title: "Read",
    body: "Turn Luci on for a news site. A few words show up in Spanish.",
  },
  {
    level: "learning",
    title: "Talk",
    body: "Tonight, chat with the tutor about what you read. It fixes your mistakes as you go.",
  },
  {
    level: "known",
    title: "Watch words light up",
    body: "Say a word correctly and it lights up in your jar.",
  },
];

export default function Home() {
  return (
    <div className="space-y-28 pb-8">
      <section className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <Greeting className="font-display text-xl font-bold text-accent" />
          <h1 className="mt-3 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Read it. Say it.
            <br />
            <span className="glow-known">Light it up.</span>
          </h1>
          <p className="mt-6 max-w-lg text-xl text-muted">
            Luci puts a few Spanish words into the news you read, then talks with you about it
            tonight.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link href="/tutor" className={`${btn.primary} h-12 w-full px-6 text-lg sm:w-auto`}>
              Start a lesson
            </Link>
            <SetupLink />
          </div>
        </div>

        {/* What a lesson looks like: the real correction view with sample data. */}
        <figure className="rounded-md bg-panel px-7 pb-6 pt-5 text-ink">
          <TranscriptView raw={rawTextFixture} result={correctResponseFixture.correction} />
          <div className="mt-5">
            <CorrectionCards raw={rawTextFixture} result={correctResponseFixture.correction} />
          </div>
          <figcaption className="mt-5 text-sm text-muted">
            Your words, with each fix and why.
          </figcaption>
        </figure>
      </section>

      <section>
        <h2 className="text-3xl font-extrabold tracking-tight">How it works</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title} className="flex items-start gap-4">
              <span
                className="jar-legend mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-jar"
                data-level={s.level}
                aria-hidden="true"
              >
                <span className="jar-light" />
              </span>
              <div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-1 text-lg text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
