import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import {
  canDeleteNote,
  listWorkspaceMembers,
  resolveWorkspaceContextFromRequest
} from "../../../lib/workspaceServer";

function sanitizeCategory(value) {
  const normalized = String(value || "idea").trim().toLowerCase();
  return ["idea", "bug", "meeting", "project"].includes(normalized)
    ? normalized
    : "idea";
}

function sanitizeTags(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((tag) => String(tag || "").replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function sanitizeEditorMode(value) {
  const normalized = String(value || "rich").trim().toLowerCase();
  return ["rich", "markdown"].includes(normalized) ? normalized : "rich";
}

function mapNote(note, membersByUserId) {
  return {
    ...note,
    author: note?.user_id ? membersByUserId.get(note.user_id) || null : null
  };
}

async function buildMembersByUserId(supabase, workspaceId) {
  const members = await listWorkspaceMembers(supabase, workspaceId);
  return new Map(
    members
      .filter((member) => member.user_id)
      .map((member) => [member.user_id, member])
  );
}

export default async function handler(req, res) {
  if (!["PUT", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: false
    });
    const noteId = Number(req.query.id);

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (!Number.isFinite(noteId)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    const { data: existingNote, error: existingError } = await supabase
      .from("notes")
      .select(
        "id,user_id,workspace_id,title,content,category,tags,pinned,editor_mode,created_at"
      )
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (existingError) return res.status(500).json({ error: existingError.message });
    if (!existingNote) return res.status(404).json({ error: "Note not found" });

    if (req.method === "DELETE") {
      if (!canDeleteNote(context.role)) {
        return res.status(403).json({ error: "Only workspace owners and admins can delete notes" });
      }

      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", noteId)
        .eq("workspace_id", context.workspace.id);

      if (error) return res.status(500).json({ error: error.message });

      await recordWorkspaceEvent(supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "note_deleted",
        notificationTitle: "Note deleted",
        notificationBody: existingNote.title,
        actionType: "note_deleted",
        activityDescription: `Deleted note "${existingNote.title}"`,
        entityType: "note",
        entityId: existingNote.id,
        metadata: {
          category: existingNote.category
        }
      });

      return res.status(200).json({ success: true, deletedId: noteId });
    }

    const title = String(req.body?.title || "Untitled note").trim() || "Untitled note";
    const content = String(req.body?.content || "");
    const category = sanitizeCategory(req.body?.category);
    const tags = sanitizeTags(req.body?.tags);
    const pinned = Boolean(req.body?.pinned);
    const editorMode = sanitizeEditorMode(req.body?.editor_mode);

    const { data, error } = await supabase
      .from("notes")
      .update({ title, content, category, tags, pinned, editor_mode: editorMode })
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .select(
        "id,user_id,workspace_id,title,content,category,tags,pinned,editor_mode,created_at"
      )
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await recordWorkspaceEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      notifyAllMembers: true,
      notificationType: "note_updated",
      notificationTitle: "Note updated",
      notificationBody: title,
      actionType: "note_updated",
      activityDescription: `Updated note "${title}"`,
      entityType: "note",
      entityId: data?.id,
      metadata: {
        category,
        tags,
        pinned
      }
    });

    const membersByUserId = await buildMembersByUserId(supabase, context.workspace.id);
    return res.status(200).json({ note: mapNote(data, membersByUserId) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
