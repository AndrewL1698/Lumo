import Link from "next/link";
import { correctResponseFixture, rawTextFixture } from "@parrot/shared";
import { DriftingFireflies } from "@/components/home/DriftingFireflies";
import { LuciMark } from "@/components/LuciMark";
import { CorrectionCards } from "@/components/tutor/CorrectionCards";
import { TranscriptView } from "@/components/tutor/TranscriptView";
import { btn, eyebrow } from "@/components/ui/PageHeader";

// Each step's firefly is brighter than the last: seen, learning, known (same lights as the jar).
const STEPS = [
  { level: "seen", title: "Read", body: "On sites you switch on, Luci swaps a few English words into Spanish. Hover one for its meaning and sound." },
  { level: "learning", title: "Talk", body: "At night, the tutor opens a Spanish conversation about the article you read and steers toward the words you looked up." },
  { level: "known", title: "Light it up", body: "Use a word correctly out loud and it glows steady in your jar. Hovering alone never lights a word." },
];

export default function Home() {
  return (
    <div className="space-y-24">
      <section className="relative isolate grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        <DriftingFireflies />
        <div>
          <p className={`${eyebrow} flex items-center gap-2`}>
            <LuciMark size={22} />
            <span>
              Luci, from <i className="normal-case tracking-normal">luciérnaga</i>, firefly
            </span>
          </p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Read it. Say it.
            <br />
            <span className="glow-known">Light it up.</span>
          </h1>
          <p className="mt-6 max-w-xl text-xl text-muted">
            Luci swaps a few Spanish words into the news you already read. Tonight, a voice tutor talks with you about that
            article and marks each mistake in your own words.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/tutor" className={`${btn.primary} h-12 w-full px-6 text-lg sm:w-auto`}>
              Start a lesson
            </Link>
            <Link href="/onboarding" className={`${btn.secondary} h-12 w-full px-6 text-lg sm:w-auto`}>
              Set up Luci
            </Link>
          </div>
        </div>

        {/* A window into a night session: the real correction view, rendered with sample data. */}
        <figure className="rounded-md bg-panel px-7 pb-6 pt-5 text-ink">
          <TranscriptView raw={rawTextFixture} result={correctResponseFixture.correction} />
          <div className="mt-5">
            <CorrectionCards raw={rawTextFixture} result={correctResponseFixture.correction} />
          </div>
          <figcaption className="mt-5 text-sm text-muted">A sample night session, shown in the real correction view.</figcaption>
        </figure>
      </section>

      <section className="max-w-4xl">
        <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
          The brighter a word glows, <br className="hidden sm:block" />
          the better you know it.
        </h2>
        <p className="mt-8 font-serif text-2xl leading-[1.9]">
          I walked into the <span className="glow-seen">cocina</span> and found the old{" "}
          <span className="glow-learning flicker">mesa</span> still covered in letters from my{" "}
          <span className="glow-known">abuela</span>.
        </p>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          <span className="glow-seen font-semibold text-ink">Cocina</span> glows faintly: you came across it.{" "}
          <span className="glow-learning font-semibold text-ink">Mesa</span> flickers: you hovered it and heard it.{" "}
          <span className="glow-known font-semibold">Abuela</span> shines steady: you said it correctly out loud.
        </p>
        <p className="mt-8 font-display text-2xl font-semibold">Luci can&apos;t light it for you. You light it by saying it.</p>
      </section>

      <section>
        <h2 className="text-3xl font-extrabold tracking-tight">How it works</h2>
        <ol className="mt-8 space-y-8">
          {STEPS.map((s) => (
            <li key={s.title} className="flex items-start gap-5">
              <span className="jar-legend mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1d2b44]" data-level={s.level} aria-hidden="true">
                <span className="jar-light" />
              </span>
              <div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-1 max-w-2xl text-lg text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-12 text-muted">
          Everything Luci stores is listed on{" "}
          <Link href="/privacy" className="text-ink underline decoration-line transition-colors duration-150 hover:decoration-ink">
            What Luci knows
          </Link>
          , and you can delete any of it.
        </p>
      </section>
    </div>
  );
}
