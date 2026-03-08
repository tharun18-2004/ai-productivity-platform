import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env";

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL", readEnv("SUPABASE_URL"));
const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

export function getSupabaseAdminClient() {
  requireEnv(
    ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    "Supabase admin configuration is incomplete."
  );

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
