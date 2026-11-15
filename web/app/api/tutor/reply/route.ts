import { ReplyRequest, replyTextFixture } from "@parrot/shared";
import { ClaudeRefusalError, streamTutorReply } from "@/lib/claude";
import { isTutorMock, TUTOR } from "@/lib/config";
import { parseBody } from "@/lib/http";
import { nextDirective, WHY } from "@/lib/tutor/policy";
import { buildTutorPrompt } from "@/lib/tutor/prompts";
import { getSession, noteSpokenCorrection } from "@/lib/tutor/session";
import type { TurnDirective } from "@/lib/tutor/types";
import type { TutorContext } from "@parrot/shared";
import { NextResponse } from "next/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const encoder = new TextEncoder();

const describe = (err: unknown) =>
  err instanceof ClaudeRefusalError ? "refusal" : err instanceof Error ? err.message : String(err);

/** J1: sample line in mock mode so the UI can be built against it. */
const MOCK_WHY = "Steering toward 'huelga': you hovered it while reading";

/**
 * J1: the final "why" line. `policyOpener` is what the policy thought; the route trusts rawText instead because
 * the policy's turn counter can lag behind (see below). Never throws.
 */
function finalWhy(directive: TurnDirective & { why: string }, policyOpener: boolean, context: TutorContext): string {
  try {
    if (directive.isOpener) return context.articleTitles.length ? WHY.opener : WHY.openerEveryday;
    if (policyOpener) return WHY.talking; // counter lagged on the first answer: nothing earlier to point at
    if (directive.correction === "none" && directive.steerLemma) {
      const lemma = directive.steerLemma.toLowerCase();
      const source = context.targetWords.find((w) => w.lemma.toLowerCase() === lemma)?.source;
      if (source === "hovered") return `${directive.why}: you hovered it while reading`;
      if (source === "due") return `${directive.why}: it's due for review`;
    }
    return directive.why;
  } catch {
    return WHY.talking;
  }
}

/** Header-safe: raw header values throw on non-Latin-1 characters (accents, ¿). The client decodes. */
const whyHeader = (why: string) => ({ "X-Parrot-Why": encodeURIComponent(why) });

export async function POST(req: Request) {
  const body = await parseBody(req, ReplyRequest);
  if (body instanceof NextResponse) return body;

  const turnId = body.utteranceId ?? "opener";
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Turn-Id": turnId,
  };

  if (isTutorMock()) {
    const words = replyTextFixture.split(" ");
    let cancelled = false;
    const mock = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < words.length; i++) {
          if (req.signal.aborted || cancelled) break;
          controller.enqueue(encoder.encode(i === 0 ? words[i] : ` ${words[i]}`));
          await sleep(40);
        }
        if (!cancelled) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(mock, { headers: { ...headers, ...whyHeader(MOCK_WHY) } });
  }

  // Barge-in: the client aborting its fetch must stop the upstream Claude call.
  const upstream = new AbortController();
  if (req.signal.aborted) upstream.abort();
  else req.signal.addEventListener("abort", () => upstream.abort(), { once: true });

  const fallback = (why: unknown) => {
    upstream.abort();
    console.error(`[tutor/reply] ${turnId} fallback: ${describe(why)}`);
    return new Response(TUTOR.cannedRepeat, { headers: { ...headers, "X-Reply-Fallback": "1" } });
  };

  let iterator: AsyncIterator<string>;
  let first: string | null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let why: string;
  try {
    const session = getSession(body.sessionId);
    // /reply runs in parallel with /correct, so the policy's turn counter can lag: don't trust its opener flag.
    const policy = nextDirective(session.policy);
    const directive = { ...policy, isOpener: body.rawText === null };
    directive.why = why = finalWhy(directive, policy.isOpener, session.context);
    if (directive.correction !== "none") noteSpokenCorrection(body.sessionId);
    console.log(`[tutor/reply] ${turnId} directive ${JSON.stringify(directive)}`);

    const { system, messages } = buildTutorPrompt({
      context: session.context,
      history: body.history,
      rawText: body.rawText,
      directive,
    });
    const it = streamTutorReply({ system, messages, signal: upstream.signal })[
      Symbol.asyncIterator
    ]();
    iterator = it;

    // First non-empty text delta, or null if the stream ends with no text.
    const firstDelta = (async () => {
      for (;;) {
        const r = await it.next();
        if (r.done) return null;
        if (r.value) return r.value;
      }
    })();
    firstDelta.catch(() => {}); // if the timeout wins, the late rejection is already handled
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no first token in ${TUTOR.replyFirstTokenTimeoutMs} ms`)),
        TUTOR.replyFirstTokenTimeoutMs,
      );
    });
    first = await Promise.race([firstDelta, timeout]);
  } catch (err) {
    return fallback(err);
  } finally {
    clearTimeout(timer);
  }
  if (first === null) return fallback("empty reply");

  const firstText = first;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(firstText));
      try {
        for (;;) {
          const r = await iterator.next();
          if (r.done || cancelled) break;
          if (r.value) controller.enqueue(encoder.encode(r.value));
        }
      } catch (err) {
        // Mid-stream error or refusal: the client keeps what it has.
        if (!upstream.signal.aborted)
          console.error(`[tutor/reply] ${turnId} stream ended early: ${describe(err)}`);
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
      upstream.abort();
    },
  });

  return new Response(stream, { headers: { ...headers, ...whyHeader(why) } });
}
