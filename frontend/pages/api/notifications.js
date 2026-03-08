import { formatRelativeTime } from "../../lib/serverActivity";
import { resolveWorkspaceContextFromRequest } from "../../lib/workspaceServer";

export default async function handler(req, res) {
  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: false
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (req.method === "GET") {
      const { data, error } = await context.supabase
        .from("notifications")
        .select("id,type,title,body,entity_type,entity_id,is_read,created_at,workspace_id")
        .eq("workspace_id", context.workspace.id)
        .eq("user_id", context.user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({
        notifications: (data || []).map((item) => ({
          ...item,
          relative_time: formatRelativeTime(item.created_at)
        })),
        role: context.role
      });
    }

    if (req.method === "PUT") {
      const notificationId = req.body?.id ? Number(req.body.id) : null;

      let query = context.supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("workspace_id", context.workspace.id)
        .eq("user_id", context.user.id);

      if (notificationId) {
        query = query.eq("id", notificationId);
      }

      const { error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
