export function readEnv(key, fallback = "") {
  if (key === "NEXT_PUBLIC_SUPABASE_URL") {
    return String(process.env.NEXT_PUBLIC_SUPABASE_URL || fallback || "").trim();
  }

  if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
    return String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fallback || "").trim();
  }

  if (key === "NEXT_PUBLIC_BACKEND_BASE_URL") {
    return String(process.env.NEXT_PUBLIC_BACKEND_BASE_URL || fallback || "").trim();
  }

  if (key === "NEXT_PUBLIC_ENABLE_AI_CHAT") {
    return String(process.env.NEXT_PUBLIC_ENABLE_AI_CHAT || fallback || "").trim();
  }

  return String(process.env[key] || fallback || "").trim();
}

export function requireEnv(keys, message) {
  const missing = keys.filter((key) => !readEnv(key));
  if (!missing.length) {
    return;
  }

  const detail = missing.join(", ");
  throw new Error(message ? `${message} Missing: ${detail}.` : `Missing environment variables: ${detail}.`);
}
