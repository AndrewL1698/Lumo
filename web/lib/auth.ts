// Extension auth: the service worker sends `Authorization: Bearer <token>` (token from /api/pair).
import { ApiError } from "@parrot/shared";
import { NextResponse } from "next/server";
import { withCors } from "./http";

// HACK: one static token for DEMO_USER_ID (architecture §11 #15). /api/pair hands it out.
export const DEMO_EXTENSION_TOKEN = "demo-extension-token";

/**
 * null = allowed; otherwise a 401 to return as-is.
 * `optional`: routes the web app also calls (no header = web page, allowed); a wrong token is still rejected.
 */
export function checkExtensionToken(req: Request, opts: { optional?: boolean } = {}): NextResponse | null {
  const header = req.headers.get("authorization");
  if (!header && opts.optional) return null;
  if (header === `Bearer ${DEMO_EXTENSION_TOKEN}`) return null;
  return withCors(NextResponse.json(ApiError.parse({ error: "missing or invalid extension token" }), { status: 401 }));
}
