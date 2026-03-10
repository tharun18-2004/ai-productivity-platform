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
        .from("video_timestamps")
        .select("id,note_id,timestamp_seconds,text,created_at")
        .eq("note_id", noteId)
        .order("created_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ timestamps: data || [] });
    }

    if (req.method === "POST") {
      const tsSeconds = Number(req.body?.timestamp);
      const text = String(req.body?.text || "").trim();
      if (!Number.isFinite(tsSeconds) || tsSeconds < 0) {
        return res.status(400).json({ error: "timestamp must be a positive number" });
      }
      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }

      const { data, error } = await supabase
        .from("video_timestamps")
        .insert({
          note_id: noteId,
          timestamp_seconds: Math.floor(tsSeconds),
          text
        })
        .select("id,note_id,timestamp_seconds,text,created_at")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await recordWorkspaceEvent(supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: false,
        notificationType: "note_timestamp_added",
        notificationTitle: "Timestamp note added",
        notificationBody: text,
        actionType: "note_timestamp_added",
        activityDescription: `Added timestamp ${formatTime(tsSeconds)} to note "${noteData.title}"`,
        entityType: "note",
        entityId: noteId,
        metadata: { note_id: noteId, timestamp_seconds: tsSeconds }
      });

      return res.status(201).json({ timestamp: data });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}
