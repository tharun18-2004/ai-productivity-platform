import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../../lib/serverActivity";
import { resolveWorkspaceContextFromRequest } from "../../../../lib/workspaceServer";

export default async function handler(req, res) {
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

    const { data: noteData, error: noteError } = await supabase
      .from("notes")
      .select("id,user_id,workspace_id,title")
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (noteError) return res.status(500).json({ error: noteError.message });
    if (!noteData) return res.status(404).json({ error: "Note not found" });

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("note_attachments")
        .select("id,note_id,file_name,file_type,file_url,created_at")
        .eq("note_id", noteId)
        .order("created_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ attachments: data || [] });
    }

    if (req.method === "POST") {
      const fileName = String(req.body?.file_name || "").trim();
      const fileType = String(req.body?.file_type || "").trim();
      const fileUrl = String(req.body?.file_url || "").trim();

      if (!fileName || !fileUrl) {
        return res.status(400).json({ error: "Attachment metadata is required" });
      }

      const { data, error } = await supabase
        .from("note_attachments")
        .insert({
          note_id: noteId,
          file_name: fileName,
          file_type: fileType,
          file_url: fileUrl
        })
        .select("id,note_id,file_name,file_type,file_url,created_at")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await recordWorkspaceEvent(supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "file_uploaded",
        notificationTitle: "File uploaded",
        notificationBody: fileName,
        actionType: "file_uploaded",
        activityDescription: `Uploaded file "${fileName}"${noteData?.title ? ` to "${noteData.title}"` : ""}`,
        entityType: "file",
        entityId: data?.id,
        metadata: {
          note_id: noteId,
          file_type: fileType || null
        }
      });

      return res.status(201).json({ attachment: data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
