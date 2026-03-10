import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import { recordUsageEvent } from "../../../lib/usageServer";
import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

const FALLBACK_STEPS = [
  "Research requirements",
  "Define scope and success criteria",
  "Design the core user journey",
  "Build the MVP",
  "Test and QA",
  "Launch and collect feedback"
];

function sanitizeDueDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function sliceTasks(raw, count) {
  const unique = [];
  raw.forEach((t) => {
    const title = String(t || "").replace(/^[*-]\s*/, "").trim();
    if (title.length < 3) return;
    if (!unique.includes(title)) unique.push(title);
  });
  if (!unique.length) {
    return FALLBACK_STEPS.slice(0, count);
  }
  if (unique.length >= count) return unique.slice(0, count);
  return [...unique, ...FALLBACK_STEPS].slice(0, count);
}

function buildDueDates(total, mode = "stagger") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (mode === "none") {
    return Array.from({ length: total }).map(() => null);
  }

  if (mode === "in_3") {
    const due = new Date(today);
    due.setDate(today.getDate() + 3);
    const text = due.toISOString().slice(0, 10);
    return Array.from({ length: total }).map(() => text);
  }

  if (mode === "in_7") {
    const due = new Date(today);
    due.setDate(today.getDate() + 7);
    const text = due.toISOString().slice(0, 10);
    return Array.from({ length: total }).map(() => text);
  }

  // default stagger
  return Array.from({ length: total }).map((_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() + idx + 1);
    return d.toISOString().slice(0, 10);
  });
}

function draftTasks(prompt, count, scheduleMode) {
  const lines = prompt.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sentences = prompt.split(/[.?!]/).filter((s) => s.trim().length > 0);
  const base = lines.length >= 2 ? lines : sentences;
  const titles = sliceTasks(base, count);
  const dueDates = buildDueDates(titles.length, scheduleMode);
  return titles.map((title, idx) => ({
    title,
    status: "todo",
    due_date: sanitizeDueDate(dueDates[idx])
  }));
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

    const prompt = String(req.body?.prompt || "").trim();
    const requestedCount = Number(req.body?.count || 4);
    const scheduleMode = String(req.body?.schedule_mode || "stagger").toLowerCase();
    const count = Math.min(Math.max(requestedCount, 1), 10);

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const drafts = draftTasks(prompt, count, scheduleMode);

    const payload = drafts.map((task) => ({
      title: task.title,
      status: task.status,
      user_id: context.user.id,
      workspace_id: context.workspace.id,
      assigned_to: context.user.id,
      due_date: task.due_date,
      generated_by: "ai_generate"
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
      notificationType: "task_generated",
      notificationTitle: "AI generated tasks",
      notificationBody: prompt,
      actionType: "task_generated",
      activityDescription: `Generated ${data.length} tasks from prompt`,
      entityType: "task",
      entityId: data[0]?.id || null,
      metadata: { prompt, count, schedule_mode: scheduleMode }
    });

    await recordUsageEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      eventType: "ai_generate"
    });

    return res.status(201).json({ tasks: data, schedule_mode: scheduleMode });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
