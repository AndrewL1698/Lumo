/** Run: npx tsx --tsconfig web/tsconfig.json web/lib/tutor/checks/reply.check.ts (no network, no env file) */
import assert from "node:assert/strict";
import { replyTextFixture } from "@parrot/shared";
import { POST } from "../../../app/api/tutor/reply/route";
import { getClaude } from "../../claude";
import { TUTOR } from "../../config";

const URL_ = "http://localhost/api/tutor/reply";
const utterance = { sessionId: "s1", utteranceId: "u1", rawText: "Hola, yo tengo la problema", history: [] };
const opener = { sessionId: "s1", utteranceId: null, rawText: null, history: [] };
const post = (body: unknown, signal?: AbortSignal) =>
  new Request(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal,
  });

async function main() {
  // ---------- (a) mock mode: fixture text, headers ----------
  process.env.TUTOR_MOCK = "1";
  let res = await POST(post(utterance));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Turn-Id"), "u1");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("X-Reply-Fallback"), null);
  assert.equal(await res.text(), replyTextFixture);

  res = await POST(post(opener));
  assert.equal(res.headers.get("X-Turn-Id"), "opener");
  assert.equal(await res.text(), replyTextFixture);

  // ---------- (b) mock mode: aborted requests stop early, nothing throws ----------
  const pre = new AbortController();
  pre.abort();
  res = await POST(post(utterance, pre.signal));
  // Node may refuse to read an aborted request's body (→ 400) or give an empty stream; both are fine.
  assert.notEqual(await res.text(), replyTextFixture);

  const mid = new AbortController();
  res = await POST(post(utterance, mid.signal));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let got = decoder.decode((await reader.read()).value, { stream: true });
  mid.abort();
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    got += decoder.decode(r.value, { stream: true });
  }
  assert.ok(got.length > 0 && got.length < replyTextFixture.length, `stopped early: "${got}"`);
  assert.ok(replyTextFixture.startsWith(got));

  // Client cancels the body instead of aborting the request.
  res = await POST(post(utterance));
  const r2 = res.body!.getReader();
  await r2.read();
  await r2.cancel();
  await new Promise((r) => setTimeout(r, 100)); // let the mock loop notice; an unhandled rejection would fail the run

  // ---------- (d) invalid body → 400 ----------
  res = await POST(post({ sessionId: "s1" }));
  assert.equal(res.status, 400);
  res = await POST(post("not json"));
  assert.equal(res.status, 400);

  // ---------- (c) real mode with no credentials: canned fallback, no network ----------
  delete process.env.TUTOR_MOCK;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  let fetchCalls = 0;
  // The SDK client keeps the fetch it saw when it was built, so install one dispatcher and swap `fetchImpl`.
  let fetchImpl = ((): Promise<Response> => {
    fetchCalls++;
    return Promise.reject(new Error("network disabled in reply.check"));
  }) as typeof fetch;
  globalThis.fetch = ((...a: Parameters<typeof fetch>) => fetchImpl(...a)) as typeof fetch;

  for (const [body, turnId] of [
    [utterance, "u1"],
    [opener, "opener"],
  ] as const) {
    const t0 = Date.now();
    res = await POST(post(body));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Reply-Fallback"), "1");
    assert.equal(res.headers.get("X-Turn-Id"), turnId);
    assert.equal(res.headers.get("Content-Type"), "text/plain; charset=utf-8");
    assert.equal(await res.text(), TUTOR.cannedRepeat);
    assert.ok(Date.now() - t0 <= TUTOR.replyFirstTokenTimeoutMs + 500, "fallback did not hang");
  }

  // ---------- (e) real mode against a fake SSE fetch (dummy key, still no network) ----------
  getClaude().apiKey = "check-dummy-key";
  const sse = (events: Record<string, unknown>[]) =>
    events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const message = {
    id: "msg_check",
    type: "message",
    role: "assistant",
    model: "check",
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  const head = [
    { type: "message_start", message },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  ];
  const delta = (text: string) => ({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  });
  const tail = (stop_reason: string) => [
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ];
  const enc = new TextEncoder();
  /** Fake upstream: sends `text`, then closes, or errors the body if `breakAfter` is set. */
  const fakeFetch = (text: string, breakAfter = false) => {
    let sent = false;
    fetchImpl = (() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            // pull, not start: erroring in the same tick would throw away the queued chunk.
            pull(c) {
              if (!sent) c.enqueue(enc.encode(text));
              else if (breakAfter) c.error(new Error("upstream dropped"));
              else c.close();
              sent = true;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      )) as typeof fetch;
  };

  // Normal stream: all deltas arrive, no fallback header.
  fakeFetch(sse([...head, delta("Claro, "), delta("¿y tú?"), ...tail("end_turn")]));
  res = await POST(post(utterance));
  assert.equal(res.headers.get("X-Reply-Fallback"), null);
  assert.equal(res.headers.get("X-Turn-Id"), "u1");
  assert.equal(await res.text(), "Claro, ¿y tú?");

  // Refusal before any text → canned line.
  fakeFetch(sse([...head, ...tail("refusal")]));
  res = await POST(post(utterance));
  assert.equal(res.headers.get("X-Reply-Fallback"), "1");
  assert.equal(await res.text(), TUTOR.cannedRepeat);

  // Refusal after some text → the stream closes cleanly with what it had.
  fakeFetch(sse([...head, delta("Claro, "), ...tail("refusal")]));
  res = await POST(post(utterance));
  assert.equal(res.headers.get("X-Reply-Fallback"), null);
  assert.equal(await res.text(), "Claro, ");

  // Upstream breaks mid-stream → same.
  fakeFetch(sse([...head, delta("Claro, ")]), true);
  res = await POST(post(utterance));
  assert.equal(res.headers.get("X-Reply-Fallback"), null);
  assert.equal(await res.text(), "Claro, ");

  // No first token: canned line after the timeout, and the upstream call is aborted. Takes ~4 s.
  let upstreamAborted = false;
  fetchImpl = ((_url: unknown, init?: RequestInit) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        upstreamAborted = true;
        reject(new Error("aborted"));
      });
    })) as typeof fetch;
  const t0 = Date.now();
  res = await POST(post(utterance));
  assert.equal(res.headers.get("X-Reply-Fallback"), "1");
  assert.equal(await res.text(), TUTOR.cannedRepeat);
  assert.ok(Date.now() - t0 >= TUTOR.replyFirstTokenTimeoutMs - 50);
  assert.ok(upstreamAborted, "timeout aborts the upstream call");

  // Barge-in: aborting the request mid-stream aborts the upstream call.
  upstreamAborted = false;
  fetchImpl = ((_url: unknown, init?: RequestInit) =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(sse([...head, delta("Claro, ")])));
            init?.signal?.addEventListener("abort", () => {
              upstreamAborted = true;
              c.error(new Error("aborted"));
            });
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    )) as typeof fetch;
  const barge = new AbortController();
  res = await POST(post(utterance, barge.signal));
  const r3 = res.body!.getReader();
  assert.equal(decoder.decode((await r3.read()).value), "Claro, ");
  barge.abort();
  assert.equal((await r3.read()).done, true);
  assert.ok(upstreamAborted, "barge-in aborts the upstream call");

  console.log(`ok (fetch attempts with no credentials: ${fetchCalls})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
