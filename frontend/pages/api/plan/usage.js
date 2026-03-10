import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { getUsageRemaining } from "../../../lib/usageServer";
import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: true,
      ensureWorkspace: false
    });

    if (!context.workspace) {
      return res.status(200).json({ remaining: 25, total: 25 });
    }

    const usage = await getUsageRemaining(supabase, {
      workspaceId: context.workspace.id,
      total: 25
    });

    return res.status(200).json(usage);
  } catch (err) {
    return res.status(200).json({ remaining: 25, total: 25 });
  }
}
