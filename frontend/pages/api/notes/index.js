import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import { listWorkspaceMembers, resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

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
  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: false
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (req.method === "GET") {
      const tagFilter = String(req.query.tag || "").trim().toLowerCase();
      const categoryFilter = String(req.query.category || "").trim().toLowerCase();
      const pinnedOnly = String(req.query.pinned || "").trim().toLowerCase() === "true";

      let query = supabase
        .from("notes")
        .select(
          "id,user_id,workspace_id,title,content,category,tags,pinned,editor_mode,created_at"
        )
        .eq("workspace_id", context.workspace.id)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (categoryFilter) query = query.eq("category", categoryFilter);
      if (pinnedOnly) query = query.eq("pinned", true);
      if (tagFilter) query = query.contains("tags", [tagFilter]);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const membersByUserId = await buildMembersByUserId(supabase, context.workspace.id);
      return res.status(200).json({
        notes: (data || []).map((note) => mapNote(note, membersByUserId)),
        workspace: context.workspace,
        role: context.role
      });
    }

    if (req.method === "POST") {
      const title = String(req.body?.title || "Untitled note").trim() || "Untitled note";
      const content = String(req.body?.content || "");
      const category = sanitizeCategory(req.body?.category);
      const tags = sanitizeTags(req.body?.tags);
      const pinned = Boolean(req.body?.pinned);
      const editorMode = sanitizeEditorMode(req.body?.editor_mode);

      const { data, error } = await supabase
        .from("notes")
        .insert({
          title,
          content,
          category,
          tags,
          pinned,
          editor_mode: editorMode,
          user_id: context.user.id,
          workspace_id: context.workspace.id
        })
        .select(
          "id,user_id,workspace_id,title,content,category,tags,pinned,editor_mode,created_at"
        )
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await recordWorkspaceEvent(supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "note_created",
        notificationTitle: "New note created",
        notificationBody: title,
        actionType: "note_created",
        activityDescription: `Created note "${title}"`,
        entityType: "note",
        entityId: data?.id,
        metadata: {
          category,
          tags
        }
      });

      const membersByUserId = await buildMembersByUserId(supabase, context.workspace.id);
      return res.status(201).json({ note: mapNote(data, membersByUserId) });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
