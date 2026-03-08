import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env";

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL", readEnv("SUPABASE_URL"));
const supabaseAnonKey = readEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  readEnv("SUPABASE_ANON_KEY")
);

requireEnv(
  ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  "Supabase browser configuration is incomplete."
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
