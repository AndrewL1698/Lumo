/** Supabase service-role client (server only; no RLS this weekend). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Constructed on first use; throws only when called without env. */
export function getDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (see .env.example)");
  // retry: false. supabase-js retries failed reads 3× (waits of 1, 2, 4 s). With the database down, that made
  // /api/vocab hang ~7 s before degrading. Routes degrade on the first failure instead.
  client = createClient(url, key, { auth: { persistSession: false }, db: { retry: false } });
  return client;
}

/** One short line for logs: the message (plus code) instead of a full error object and stack trace. */
export function errText(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: unknown; code?: unknown };
    return `${String(e.message)}${e.code ? ` (${String(e.code)})` : ""}`;
  }
  return String(err);
}

// TODO(karthik): typed table helpers / generated DB types.
