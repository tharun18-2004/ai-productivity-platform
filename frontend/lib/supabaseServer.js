import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env";

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL", readEnv("SUPABASE_URL"));
const supabaseKey = readEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  readEnv("SUPABASE_ANON_KEY", readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
);

export function getSupabaseServerClient() {
  requireEnv(["NEXT_PUBLIC_SUPABASE_URL"], "Supabase server configuration is incomplete.");
  if (!supabaseKey) {
    throw new Error(
      "Supabase server configuration is incomplete. Set SUPABASE_SERVICE_ROLE_KEY for server/admin routes, or provide an anon key for read-only server access."
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
