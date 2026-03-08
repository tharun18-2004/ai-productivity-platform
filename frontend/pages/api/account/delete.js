import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "../../../lib/supabaseAdmin";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

function getSupabaseAuthVerifier() {
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Missing Supabase public env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function bestEffortDeleteAvatarBucketFolder(adminClient, authUserId) {
  try {
    const { data: files, error } = await adminClient.storage
      .from("profile-images")
      .list(authUserId, {
        limit: 100
      });

    if (error || !files?.length) {
      return;
    }

    const paths = files
      .filter((file) => file?.name)
      .map((file) => `${authUserId}/${file.name}`);

    if (!paths.length) {
      return;
    }

    await adminClient.storage.from("profile-images").remove(paths);
  } catch {
    // Avatar cleanup should not block account deletion.
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return res.status(401).json({ error: "Missing account session." });
    }

    const verifier = getSupabaseAuthVerifier();
    const {
      data: { user: authUser },
      error: authError
    } = await verifier.auth.getUser(token);

    if (authError || !authUser?.id || !authUser?.email) {
      return res.status(401).json({ error: "Could not verify the signed-in user." });
    }

    const adminClient = getSupabaseAdminClient();
    const email = String(authUser.email).trim().toLowerCase();

    const { data: appUser, error: userLookupError } = await adminClient
      .from("users")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (userLookupError) {
      return res.status(500).json({ error: userLookupError.message });
    }

    if (appUser?.id) {
      const { error: deleteAppUserError } = await adminClient
        .from("users")
        .delete()
        .eq("id", appUser.id);

      if (deleteAppUserError) {
        return res.status(500).json({ error: deleteAppUserError.message });
      }
    }

    await bestEffortDeleteAvatarBucketFolder(adminClient, authUser.id);

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(authUser.id);
    if (deleteAuthError) {
      return res.status(500).json({
        error: deleteAuthError.message || "Could not delete the auth account."
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({
      error:
        err?.message ||
        "Account deletion is not configured correctly. Check Supabase service role settings."
    });
  }
}
