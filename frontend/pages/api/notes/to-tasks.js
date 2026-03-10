import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import { recordUsageEvent } from "../../../lib/usageServer";
import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

const MAX_ACTIONS = 10;
const OPENAI_ENABLED = process.env.OPENAI_ENABLED === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";

function extractLines(content = "") {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isActionable(line) {
  return (
    /^[-*]\s+/.test(line) ||
    /\b(todo|action|next step|need to|fix|design|ship|implement|build|write)\b/i.test(line)
  );
}

function toTasks(noteTitle, content) {
  const lines = extractLines(content);
  const actions = lines.filter(isActionable).slice(0, MAX_ACTIONS);
  if (!actions.length) return [];
  return actions.map((line) => {
    const title = line.replace(/^[-*]\s*/, "");
    return {
      title: title || `Follow-up from "${noteTitle}"`,
      status: "todo"
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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

    const noteId = Number(req.body?.note_id);
    if (!Number.isFinite(noteId)) {
      return res.status(400).json({ error: "note_id is required" });
    }

    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("id,title,content,workspace_id")
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (noteError) return res.status(500).json({ error: noteError.message });
    if (!note) return res.status(404).json({ error: "Note not found" });

    let tasksDraft = [];

    // Prefer OpenAI extraction when enabled
    if (OPENAI_ENABLED && OPENAI_API_KEY) {
      try {
        const aiTasks = await aiExtractTasks(note.content);
        if (Array.isArray(aiTasks) && aiTasks.length) {
          tasksDraft = aiTasks.slice(0, MAX_ACTIONS).map((title) => ({ title, status: "todo" }));
        }
      } catch (err) {
        console.warn("AI task extraction failed, using heuristic:", err?.message || err);
      }
    }

    if (!tasksDraft.length) {
      tasksDraft = toTasks(note.title, note.content);
    }

    if (!tasksDraft.length) {
      return res.status(200).json({ tasks: [], message: "No action items detected." });
    }

    const payload = tasksDraft.map((task) => ({
      title: task.title,
      status: task.status,
      user_id: context.user.id,
      workspace_id: context.workspace.id,
      assigned_to: context.user.id
    }));

    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select("id,title,status,user_id,workspace_id,assigned_to,due_date,created_at");

    if (error) return res.status(500).json({ error: error.message });

    await recordWorkspaceEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      notifyAllMembers: true,
      notificationType: "note_action_items",
      notificationTitle: "Tasks created from a note",
      notificationBody: note.title,
      actionType: "task_created_from_note",
      activityDescription: `Converted note "${note.title}" into ${data.length} tasks`,
      entityType: "note",
      entityId: note.id,
      metadata: { note_id: note.id, task_count: data.length }
    });

    await recordUsageEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      eventType: "note_to_task"
    });

    return res.status(201).json({ tasks: data, from_note: note.id });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}

async function aiExtractTasks(text) {
  const content = String(text || "").trim();
  if (!content) return [];

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Extract concise, actionable tasks from the user's note. Respond ONLY with a JSON array of task titles (strings). Do not number or add status."
        },
        { role: "user", content: content.slice(0, 6000) }
      ],
      temperature: 0.2
    })
  });

  const data = await response.json().catch(() => ({}));
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !raw) {
    throw new Error(raw || data?.error?.message || "OpenAI request failed");
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch (err) {
    // If not JSON, attempt to split lines
    return raw
      .split(/\r?\n|\d+\.\s+|-\s+/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  return [];
}
