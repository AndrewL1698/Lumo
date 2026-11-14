import Link from "next/link";
import { correctResponseFixture, rawTextFixture } from "@parrot/shared";
import { LuciMark } from "@/components/LuciMark";
import { CorrectionCards } from "@/components/tutor/CorrectionCards";
import { TranscriptView } from "@/components/tutor/TranscriptView";
import { btn, eyebrow } from "@/components/ui/PageHeader";

const STEPS = [
  { title: "Read", body: "On sites you switch on, Luci swaps a few English words into Spanish. Hover one for its meaning and sound." },
  { title: "Talk", body: "At night, the tutor opens a Spanish conversation about the article you read and steers toward the words you looked up." },
  { title: "Light it up", body: "Use a word correctly out loud and it glows steady in your jar. Hovering alone never lights a word." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className={`${eyebrow} flex items-center gap-2`}>
            <LuciMark size={22} />
            <span>
              Luci, from <i className="normal-case tracking-normal">luciérnaga</i>, firefly
            </span>
          </p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.1] tracking-tight">
            Read it. Say it.
            <br />
            <span className="glow-known">Light it up.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Luci swaps a few Spanish words into the news you already read. Tonight, a voice tutor talks with you about that
            article and marks each mistake in your own words.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/tutor" className={`${btn.primary} h-12 w-full px-6 text-lg sm:w-auto`}>
              Start a lesson
            </Link>
            <Link href="/onboarding" className={`${btn.secondary} h-12 w-full px-6 text-lg sm:w-auto`}>
              Set up Luci
            </Link>
          </div>
        </div>

        {/* The real correction view, rendered with sample session data. */}
        <div className="rounded-sm border border-line bg-panel px-6 py-5">
          <p className={`${eyebrow} mb-2`}>Night session</p>
          <TranscriptView raw={rawTextFixture} result={correctResponseFixture.correction} />
          <div className="mt-4">
            <CorrectionCards raw={rawTextFixture} result={correctResponseFixture.correction} />
          </div>
          <p className="mt-4 text-sm text-muted">Sample session data, shown in the real correction view.</p>
        </div>
      </section>

      <section className="rounded-sm border border-sun-line bg-sun px-6 py-7 sm:px-8">
        <p className={eyebrow}>How bright a word glows</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight">The glow shows how well you know it.</h2>
        <p className="mt-6 rounded-sm border border-sun-line bg-panel px-5 py-4 font-serif text-xl leading-[1.9]">
          I walked into the <span className="glow-seen">cocina</span> and found the old{" "}
          <span className="glow-learning flicker">mesa</span> still covered in letters from my{" "}
          <span className="glow-known">abuela</span>.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="font-bold">
              <span className="glow-seen">Seen</span>
            </dt>
            <dd className="mt-1 text-muted">A faint glow. You came across it.</dd>
          </div>
          <div>
            <dt className="font-bold">
              <span className="glow-learning">Learning</span>
            </dt>
            <dd className="mt-1 text-muted">It flickers. You hovered it and heard it.</dd>
          </div>
          <div>
            <dt className="font-bold">
              <span className="glow-known">Known</span>
            </dt>
            <dd className="mt-1 text-muted">A steady light. You said it correctly out loud.</dd>
          </div>
        </dl>
        <p className="mt-6 font-display text-xl font-semibold">Luci can&apos;t light it for you. You light it by saying it.</p>
      </section>

      <section>
        <h2 className="border-b border-line pb-3 text-2xl font-extrabold">How it works</h2>
        <ol className="divide-y divide-line border-b border-line">
          {STEPS.map((s) => (
            <li key={s.title} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-muted">
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
