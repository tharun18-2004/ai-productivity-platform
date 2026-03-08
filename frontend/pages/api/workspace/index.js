import { resolveWorkspaceContextFromRequest, listWorkspaceMembers } from "../../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: false
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const members = await listWorkspaceMembers(context.supabase, context.workspace.id);
    return res.status(200).json({
      workspace: context.workspace,
      membership: context.membership,
      role: context.role,
      user: context.user,
      members
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
