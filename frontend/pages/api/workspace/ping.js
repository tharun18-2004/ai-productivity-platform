import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: true
    });

    if (!context.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    return res.status(200).json({
      workspace: { id: context.workspace.id, name: context.workspace.name },
      membership: { id: context.membership.id, role: context.membership.role },
      user: { id: context.user.id, email: context.user.email }
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
