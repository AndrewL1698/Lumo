"use client";
import Link from "next/link";
import type { Settings } from "@parrot/shared";
import { LEVELS } from "@/components/onboarding/LevelPicker";
import { PairingCode } from "@/components/onboarding/PairingCode";
import { ReadingSites } from "@/components/onboarding/ReadingSites";
import type { SetupStatus } from "./useSetupStatus";

// "Get set up" at the top of Settings: setup status, with the full setup flow on /onboarding (D-020). Level and the reading toggle always
// have a value, so they show as set, with a link down to change them. Pairing and the first site come from what the
// extension has sent. All four done: it folds to one line.
function Item({
  done,
  title,
  detail,
  children,
}: {
  done: boolean;
  title: string;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-bold ${
          done ? "border-go text-go" : "border-line text-muted"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-ink">
          {title}
          <span className="sr-only">{done ? ": done" : ": not done yet"}</span>
        </p>
        {detail && <p className="mt-0.5 text-muted">{detail}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

const jump =
  "text-ink underline decoration-line underline-offset-4 transition-colors duration-150 hover:decoration-ink";

export function SetupChecklist({ settings, status }: { settings: Settings; status: SetupStatus }) {
  const level = LEVELS.find((l) => l.value === settings.level)?.title ?? settings.level;
  const doneCount = 2 + Number(status.paired) + Number(status.siteOn);

  if (status.complete) {
    return (
      <details id="setup" className="group mb-10 scroll-mt-24">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-sm text-go transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
          Setup complete ✓ <span className="text-sm text-muted group-open:hidden">Show steps</span>
        </summary>
        <ol className="mt-5 space-y-4">
          <Item done title="Pick your level" detail={level} />
          <Item done title="Pair the extension" />
          <Item done title="Turn Lumo on for a site" />
          <Item
            done
            title="Use your reading in lessons"
            detail={settings.useReadingInLessons ? "On" : "Off"}
          />
        </ol>
      </details>
    );
  }

  return (
    <section
      id="setup"
      aria-labelledby="setup-title"
      className="mb-12 scroll-mt-24 rounded-md border border-sun-line bg-sun p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-title" className="text-2xl font-extrabold text-ink">
          Get set up
        </h2>
        <p className="text-muted">{doneCount} of 4 done</p>
      </div>
      <p className="mt-2 text-muted">
        New here?{" "}
        <Link href="/onboarding" className={jump}>
          Go through setup step by step
        </Link>
        .
      </p>
      <ol className="mt-6 space-y-6">
        <Item
          done
          title="Pick your level"
          detail={
            <>
              {level}.{" "}
              <a href="#level" className={jump}>
                Change
              </a>
            </>
          }
        />
        <Item done={status.paired} title="Pair the extension">
          {!status.paired && <PairingCode />}
        </Item>
        <Item done={status.siteOn} title="Turn Lumo on for a site">
          {!status.siteOn && <ReadingSites allowlist={settings.allowlist} />}
        </Item>
        <Item
          done
          title="Use your reading in lessons"
          detail={
            <>
              {settings.useReadingInLessons ? "On" : "Off"}.{" "}
              <a href="#reading" className={jump}>
                Change
              </a>
            </>
          }
        />
      </ol>
    </section>
  );
}
