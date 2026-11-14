import { TutorContext, tutorContextFixture } from "@parrot/shared";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// TODO(andrew): build session context (hovered words, due words, target words) from the learner model.
export async function GET() {
  return json(tutorContextFixture, TutorContext);
}
