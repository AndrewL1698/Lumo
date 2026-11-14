/** Supabase service-role client (server only; no RLS this weekend). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Constructed on first use; throws only when called without env. */
export function getDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (see .env.example)");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// TODO(karthik): typed table helpers / generated DB types.
