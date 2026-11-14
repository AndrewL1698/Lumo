import {
  DataDeleteRequest,
  DataDeleteResponse,
  DataResponse,
  dataDeleteResponseFixture,
  dataResponseFixture,
} from "@parrot/shared";
import { json, parseBody } from "@/lib/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TODO(karthik): list everything stored for DEMO_USER_ID.
export async function GET() {
  return json(dataResponseFixture, DataResponse);
}

// TODO(karthik): delete one word/event/article, or everything.
export async function DELETE(req: Request) {
  const body = await parseBody(req, DataDeleteRequest);
  if (body instanceof NextResponse) return body;
  return json(dataDeleteResponseFixture, DataDeleteResponse);
}
