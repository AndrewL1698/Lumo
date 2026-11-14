import { PairRequest, PairResponse, pairResponseFixture } from "@parrot/shared";
import { json, parseBody, preflight, withCors } from "@/lib/http";
import { NextResponse } from "next/server";

export const OPTIONS = preflight;

// TODO(karthik): look up the pairing code, mint and store an extension token.
export async function POST(req: Request) {
  const body = await parseBody(req, PairRequest);
  if (body instanceof NextResponse) return withCors(body);
  return withCors(json(pairResponseFixture, PairResponse));
}
