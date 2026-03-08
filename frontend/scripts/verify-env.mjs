import fs from "node:fs";
import path from "node:path";

const requiredEnv = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    description: "Supabase project URL used by the browser and server helpers."
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    description: "Supabase anonymous key used by the browser client."
  }
];

const optionalEnv = [
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    description: "Needed for admin-only server routes like account deletion and backend sync helpers."
  },
  {
    key: "BACKEND_API_BASE_URL",
    description: "Used by the optional AI/backend bridge."
  }
];

function readEnv(key) {
  return String(process.env[key] || "").trim();
}

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function formatStatus(entry, tone) {
  const prefix = tone === "missing" ? "missing" : tone === "warning" ? "warning" : "ok";
  return `${prefix}: ${entry.key} - ${entry.description}`;
}

function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const missing = [];
  const warnings = [];

  for (const entry of requiredEnv) {
    if (!readEnv(entry.key)) {
      missing.push(formatStatus(entry, "missing"));
    }
  }

  for (const entry of optionalEnv) {
    if (!readEnv(entry.key)) {
      warnings.push(formatStatus(entry, "warning"));
    }
  }

  if (!missing.length && !warnings.length) {
    console.log("Environment verification passed.");
    return;
  }

  if (missing.length) {
    console.error("Required environment variables are missing:");
    for (const line of missing) {
      console.error(`- ${line}`);
    }
  }

  if (warnings.length) {
    const stream = missing.length ? console.error : console.log;
    stream("Optional environment variables not set:");
    for (const line of warnings) {
      stream(`- ${line}`);
    }
  }

  if (missing.length) {
    process.exit(1);
  }
}

main();
