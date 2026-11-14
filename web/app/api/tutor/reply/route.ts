import { ReplyRequest, replyTextFixture } from "@parrot/shared";
import { parseBody } from "@/lib/http";
import { NextResponse } from "next/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// TODO(andrew): stream lib/claude.ts streamTutorReply() instead of the fixture.
export async function POST(req: Request) {
  const body = await parseBody(req, ReplyRequest);
  if (body instanceof NextResponse) return body;

  const words = replyTextFixture.split(" ");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < words.length; i++) {
        if (req.signal.aborted) break;
        controller.enqueue(encoder.encode(i === 0 ? words[i] : ` ${words[i]}`));
        await sleep(40);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Turn-Id": body.utteranceId ?? "opener",
    },
  });
}
