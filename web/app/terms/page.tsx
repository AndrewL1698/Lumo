import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Terms · Lumo" };

export default function Page() {
  return (
    <LegalPage title="Terms of use" updated="November 14, 2026">
      <section>
        <h2>A prototype</h2>
        <p>
          Lumo is a student prototype built at HackPrinceton Fall 2026. It is provided as is, without warranty, and may
          change or stop working at any time.
        </p>
      </section>

      <section>
        <h2>Corrections can be wrong</h2>
        <p>
          Corrections and replies are written by an AI model and checked by code, but they can still be wrong. Treat them as
          practice feedback, not as an authority on Spanish.
        </p>
      </section>

      <section>
        <h2>Using Lumo</h2>
        <ul>
          <li>Switch Lumo on only for sites you are allowed to read.</li>
          <li>Do not use the tutor to submit anything unlawful or anyone else&apos;s personal information.</li>
          <li>Speech and text you send are processed by the services named in the privacy policy.</li>
        </ul>
      </section>

      <section>
        <h2>Word list</h2>
        <p>
          Word frequencies come from FrequencyWords by Hermit Dave, derived from OpenSubtitles 2018, licensed CC-BY-SA 4.0.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          What Lumo stores and how to delete it is set out in the{" "}
          <Link href="/privacy-policy" className="text-ink underline decoration-line transition-colors duration-150 hover:decoration-ink">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </LegalPage>
  );
}
