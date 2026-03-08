import { resolveWorkspaceContextFromRequest } from "../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const queryText = String(req.query.q || "").trim().toLowerCase();
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: false
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (!queryText) {
      return res.status(200).json({ notes: [], tasks: [], files: [] });
    }

    const notesQuery = context.supabase
      .from("notes")
      .select("id,title,content,category,tags,pinned,created_at")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const tasksQuery = context.supabase
      .from("tasks")
      .select("id,title,status,due_date,created_at,assigned_to")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const filesQuery = context.supabase
      .from("note_attachments")
      .select("id,note_id,file_name,file_type,file_url,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    const [{ data: noteIds }, { data: notesData, error: notesError }, { data: tasksData, error: tasksError }] =
      await Promise.all([
        context.supabase.from("notes").select("id").eq("workspace_id", context.workspace.id),
        notesQuery,
        tasksQuery
      ]);

    let scopedFilesQuery = filesQuery;
    const allowedIds = (noteIds || []).map((row) => row.id);
    scopedFilesQuery = allowedIds.length
      ? scopedFilesQuery.in("note_id", allowedIds)
      : scopedFilesQuery.in("note_id", [-1]);

    const { data: filesData, error: filesError } = await scopedFilesQuery;

    const firstError = notesError || tasksError || filesError;
    if (firstError) {
      return res.status(500).json({ error: firstError.message });
    }

    return res.status(200).json({
      notes: (notesData || []).filter((item) =>
        [item.title, item.content, ...(item.tags || [])].join(" ").toLowerCase().includes(queryText)
      ),
      tasks: (tasksData || []).filter((item) =>
        `${item.title || ""} ${item.status || ""} ${item.due_date || ""}`.toLowerCase().includes(queryText)
      ),
      files: (filesData || []).filter((item) =>
        `${item.file_name || ""} ${item.file_type || ""}`.toLowerCase().includes(queryText)
      )
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
