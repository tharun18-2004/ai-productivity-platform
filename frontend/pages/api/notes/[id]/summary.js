import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../../lib/serverActivity";
import { resolveWorkspaceContextFromRequest } from "../../../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const noteId = Number(req.query.id);
  if (!Number.isFinite(noteId)) {
    return res.status(400).json({ error: "Invalid note id" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: true
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("id,title,workspace_id")
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (noteError) return res.status(500).json({ error: noteError.message });
    if (!note) return res.status(404).json({ error: "Note not found" });

    await recordWorkspaceEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      notifyAllMembers: true,
      notificationType: "note_ai_summary",
      notificationTitle: "AI summary generated",
      notificationBody: note.title,
      actionType: "note_ai_summary",
      activityDescription: `Generated an AI summary for "${note.title}"`,
      entityType: "note",
      entityId: note.id,
      metadata: {
        summary_length: String(req.body?.summary || "").length
      }
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
