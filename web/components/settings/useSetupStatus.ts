"use client";
import { DataResponse, Settings } from "@parrot/shared";
import { useFetch } from "@/components/useFetch";

// Setup status from data Luci already stores (read only). A site on the allowlist, an article, or any activity from
// the extension can only exist once the extension is paired; a site or an article means it's on for a site.
const FROM_EXTENSION = new Set(["seen", "hover", "knew_it", "didnt_know", "reading"]);

export type SetupStatus = { paired: boolean; siteOn: boolean; complete: boolean };

/** null while loading or if the data can't be read (callers then show nothing rather than guess). */
export function useSetupStatus(): SetupStatus | null {
  const data = useFetch("/api/data", DataResponse, { refetchOnFocus: true }).data;
  const settings = useFetch("/api/settings", Settings, { refetchOnFocus: true }).data;
  if (!data || !settings) return null;
  const siteOn = settings.allowlist.length > 0 || data.articles.length > 0 || data.events.some((e) => e.type === "reading");
  const paired = siteOn || data.events.some((e) => FROM_EXTENSION.has(e.type));
  return { paired, siteOn, complete: paired && siteOn };
}
