import { NextResponse } from "next/server";
import { z } from "zod";

/** Parse a JSON body with a shared schema. Returns the data, or a 400 response to return as-is. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  return parsed.data;
}

/** Validate an outgoing body against its shared schema, then return it as JSON. */
export function json<S extends z.ZodType>(data: z.input<S>, schema: S, init?: ResponseInit) {
  return NextResponse.json(schema.parse(data), init);
}

/** Permissive CORS for routes the extension service worker calls (Bearer token, no cookies). */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function withCors<R extends Response>(res: R): R {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

/** Preflight handler: `export const OPTIONS = preflight;` */
export function preflight() {
  return withCors(new NextResponse(null, { status: 204 }));
}
