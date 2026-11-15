"use client";
import Link from "next/link";
import { useSetupStatus } from "@/components/settings/useSetupStatus";

/** "Set up Luci" on the home page, only while setup isn't finished. Goes to the checklist on Settings. */
export function SetupLink() {
  const status = useSetupStatus();
  if (!status || status.complete) return null;
  return (
    <Link
      href="/settings#setup"
      className="text-lg text-muted underline decoration-line underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
    >
      Set up Luci
    </Link>
  );
}
