import { formatRelativeTime } from "../../lib/serverActivity";
import { resolveWorkspaceContextFromRequest } from "../../lib/workspaceServer";

export default async function handler(req, res) {
  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: false
    });

    if (!context?.supabase) {
      return res.status(500).json({ error: "Supabase client missing (check env keys)." });
    }

    if (!context.workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (req.method === "GET") {
      const baseQuery = context.supabase
        .from("notifications")
        .select("id,type,title,body,entity_type,entity_id,is_read,created_at,workspace_id,user_id")
        .eq("workspace_id", context.workspace.id)
        .order("created_at", { ascending: false })
        .limit(20);

      // If user_id is present, filter; otherwise return workspace-wide notifications
      const query = context.user?.id ? baseQuery.eq("user_id", context.user.id) : baseQuery;
      const { data, error } = await query;

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

      let query = context.supabase.from("notifications").update({ is_read: true }).eq("workspace_id", context.workspace.id);

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
