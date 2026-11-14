import { NextResponse } from "next/server";

// TODO(andrew): audio/wav body → lib/elevenlabs.ts sttBatch() → SttBatchResponse.
export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
