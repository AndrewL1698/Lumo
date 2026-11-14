import { z } from "zod";

/** Events the extension sends (specs §5.6). */
export const ExtensionEventType = z.enum([
  "seen",
  "hover",
  "knew_it",
  "didnt_know",
  "quiz_pass",
  "quiz_fail",
  "reading",
]);
export type ExtensionEventType = z.infer<typeof ExtensionEventType>;

/** Learner-model events produced by the voice tutor (docs/voice-plan.md §4). */
export const TutorEventType = z.enum(["spoken_correct", "spoken_incorrect"]);
export type TutorEventType = z.infer<typeof TutorEventType>;

export const LearnerEventType = z.union([ExtensionEventType, TutorEventType]);
export type LearnerEventType = z.infer<typeof LearnerEventType>;

/**
 * One extension event. `id` is a client-generated uuid so retries are idempotent.
 * `articleKey` = hash(domain + title); URLs are never sent.
 * `meta.sentence` is the sentence a hovered word appeared in (agreed: stored in `events.meta jsonb`).
 */
export const ExtensionEvent = z.object({
  id: z.string().uuid(),
  type: ExtensionEventType,
  lemma: z.string().optional(),
  articleKey: z.string(),
  ts: z.number().int(), // epoch ms
  meta: z
    .object({
      sentence: z.string().optional(),
      title: z.string().optional(),
      domain: z.string().optional(),
    })
    .optional(),
});
export type ExtensionEvent = z.infer<typeof ExtensionEvent>;

/** POST /api/events */
export const EventsRequest = z.object({ events: z.array(ExtensionEvent).min(1) });
export type EventsRequest = z.infer<typeof EventsRequest>;

export const EventsResponse = z.object({
  accepted: z.number().int(),
  duplicates: z.number().int(),
});
export type EventsResponse = z.infer<typeof EventsResponse>;
