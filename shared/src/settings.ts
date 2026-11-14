import { z } from "zod";
import { Level } from "./words";

/** Swap intensity (architecture §6: fixed levels in scope; Auto is stretch). */
export const Intensity = z.enum(["off", "light", "normal", "immersion"]);
export type Intensity = z.infer<typeof Intensity>;

/** GET/PUT /api/settings — shared by the web app and the extension. */
export const Settings = z.object({
  level: Level,
  intensity: Intensity,
  perPageCap: z.number().int().min(0).max(25),
  allowlist: z.array(z.string()), // origins, e.g. "https://www.bbc.com"
  pausedSites: z.array(z.string()),
  useReadingInLessons: z.boolean(),
});
export type Settings = z.infer<typeof Settings>;
