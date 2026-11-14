import { VocabResponse, vocabResponseFixture } from "@parrot/shared";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// TODO(karthik): learning / known / mastered lists + streak from the DB.
export async function GET() {
  return json(vocabResponseFixture, VocabResponse);
}
