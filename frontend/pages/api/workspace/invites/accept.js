import { recordWorkspaceEvent } from "../../../../lib/serverActivity";
import { resolveWorkspaceContextFromRequest } from "../../../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: true,
      activatePendingInvites: true
    });

    if (!context.user) {
      return res.status(400).json({ error: "User could not be resolved" });
    }

    if (!context.workspace || !context.membership) {
      return res.status(404).json({ error: "No invite or workspace membership found" });
    }

    await recordWorkspaceEvent(context.supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      notifyAllMembers: true,
      notificationType: "workspace_invite_joined",
      notificationTitle: "Member joined workspace",
      notificationBody: `${context.user.name} joined ${context.workspace.name}.`,
      actionType: "workspace_invite_joined",
      activityDescription: `${context.user.name} joined the workspace.`,
      entityType: "workspace_member",
      entityId: context.membership.id,
      metadata: {
        role: context.role
      }
    });

    return res.status(200).json({
      workspace: context.workspace,
      membership: context.membership,
      role: context.role
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
