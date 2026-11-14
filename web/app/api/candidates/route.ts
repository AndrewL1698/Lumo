import { CandidatesResponse, candidatesResponseFixture } from "@parrot/shared";
import { json, preflight, withCors } from "@/lib/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// TODO(karthik): user word states + scoring flags from the learner model.
export async function GET() {
  return withCors(json(candidatesResponseFixture, CandidatesResponse));
}
