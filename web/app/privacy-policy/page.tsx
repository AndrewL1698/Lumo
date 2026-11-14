import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Privacy policy · Parrot" };

export default function Page() {
  return (
    <LegalPage title="Privacy policy" updated="November 14, 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          Parrot is a student project built at HackPrinceton Fall 2026. It runs as a single demo account. There are no user
          accounts, ads or tracking cookies.
        </p>
      </section>

      <section>
        <h2>What Parrot stores</h2>
        <ul>
          <li>Spanish words you look up or practise, with their learning state and review dates.</li>
          <li>A short activity log: which word you hovered, when you read an article, and whether you used a word correctly.</li>
          <li>The title and website of articles you read on sites you switched on. Never the page text or the full address.</li>
          <li>Tutor conversations: the text of what you said, the corrections, and the tutor&apos;s replies.</li>
          <li>Your settings: level, swap intensity, the sites you allowed or paused.</li>
        </ul>
      </section>

      <section>
        <h2>What Parrot never collects</h2>
        <ul>
          <li>Anything on sites you have not switched on.</li>
          <li>Email, chat, banking, health, school and work tools, or login and form pages, even if you allow them.</li>
          <li>What you type on other websites, or your browsing history.</li>
        </ul>
      </section>

      <section>
        <h2>Services that process your data</h2>
        <ul>
          <li>Anthropic (Claude) reads your transcripts to correct them and to write the tutor&apos;s replies.</li>
          <li>ElevenLabs turns your speech into text and speaks the tutor&apos;s replies. Your voice is sent to it for that only.</li>
          <li>Supabase hosts the database that holds the data listed above.</li>
        </ul>
        <p className="mt-2">Each service handles data under its own terms.</p>
      </section>

      <section>
        <h2>See and delete your data</h2>
        <p>
          Every stored item is listed on{" "}
          <Link href="/privacy" className="text-ink underline decoration-line transition-colors duration-150 hover:decoration-ink">
            What Parrot knows
          </Link>
          . You can delete any item, or everything at once. Deleting is permanent.
        </p>
      </section>
    </LegalPage>
  );
}
