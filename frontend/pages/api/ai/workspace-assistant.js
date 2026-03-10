import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordUsageEvent } from "../../../lib/usageServer";
import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

const TODAY = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function isThisWeek(date) {
  if (!date) return false;
  const d = new Date(date);
  const today = TODAY();
  const day = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return d >= monday && d <= today;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: false
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const prompt = String(req.body?.prompt || "").trim().toLowerCase();
    const workspaceId = context.workspace.id;

    const [tasksResp, notesResp, activityResp] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,status,due_date,created_at,assigned_to")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("id,title,content,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("activity_logs")
        .select("id,description,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10)
    ]);

    const tasks = tasksResp.data || [];
    const notes = notesResp.data || [];
    const activity = activityResp.data || [];
    const assignedIds = Array.from(
      new Set((tasks || []).map((t) => t.assigned_to).filter((v) => v !== null && v !== undefined))
    );
    const usersResp =
      assignedIds.length > 0
        ? await supabase.from("users").select("id,name,email").in("id", assignedIds)
        : { data: [] };
    const assignees = usersResp.data || [];

    const today = TODAY();
    const tasksDueToday = tasks.filter((t) => t.due_date && new Date(t.due_date) <= today && t.status !== "done");
    const overdue = tasks.filter(
      (t) => t.due_date && new Date(t.due_date) < today && t.status !== "done"
    );
    const next7 = tasks.filter((t) => {
      if (!t.due_date || t.status === "done") return false;
      const d = new Date(t.due_date);
      return d > today && d <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    });
    const pending = tasks.filter((t) => t.status !== "done");
    const completed = tasks.filter((t) => t.status === "done");
    const notesThisWeek = notes.filter((n) => isThisWeek(n.created_at));
    const lastWeek = notes.filter((n) => {
      if (!n.created_at) return false;
      const d = new Date(n.created_at);
      const start = new Date(today);
      start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    });

    const assigneeMap = assignees.reduce((acc, u) => {
      if (u?.id) {
        acc[String(u.id)] = u.name || u.email || "Member";
      }
      return acc;
    }, {});

    let answer;
    if (prompt.includes("due today")) {
      if (!tasksDueToday.length) {
        answer = "No tasks are due today.";
      } else {
        answer = `Tasks due today: ${tasksDueToday
          .map((t) => t.title)
          .slice(0, 10)
          .join(", ")}.`;
      }
    } else if (prompt.includes("overdue") || prompt.includes("past due") || prompt.includes("late")) {
      answer = overdue.length
        ? `Overdue: ${overdue
            .map((t) => `${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`)
            .slice(0, 10)
            .join(", ")}.`
        : "No overdue tasks. Nice work!";
    } else if (prompt.includes("next 7") || prompt.includes("next week") || prompt.includes("coming week")) {
      answer = next7.length
        ? `Due in the next 7 days: ${next7
            .map((t) => `${t.title}${t.due_date ? ` (${t.due_date})` : ""}`)
            .slice(0, 10)
            .join(", ")}.`
        : "No tasks due in the next 7 days.";
    } else if (prompt.includes("per member") || prompt.includes("by assignee") || prompt.includes("who has")) {
      const groupedPending = pending.reduce((acc, t) => {
        const raw = t.assigned_to ?? "unassigned";
        const safe = raw === null || raw === undefined || raw === "" ? "unassigned" : String(raw);
        acc[safe] = acc[safe] || [];
        acc[safe].push(t);
        return acc;
      }, {});
      const groupedAll = tasks.reduce((acc, t) => {
        const raw = t.assigned_to ?? "unassigned";
        const safe = raw === null || raw === undefined || raw === "" ? "unassigned" : String(raw);
        acc[safe] = acc[safe] || [];
        acc[safe].push(t);
        return acc;
      }, {});
      const parts = Object.entries(groupedAll)
        .map(([assigneeId, list]) => {
          const key = String(assigneeId);
          const name =
            key === "unassigned" || key === "null" || key === "undefined"
              ? "Unassigned"
              : assigneeMap[key] || key || "Member";
          const pendingCount = groupedPending[key]?.length || 0;
          const completedCount = list.filter((t) => t.status === "done").length;
          return { name, pendingCount, completedCount, total: list.length };
        })
        .sort((a, b) => b.pendingCount - a.pendingCount || b.total - a.total)
        .map((item) => `${item.name}: pending ${item.pendingCount}, done ${item.completedCount}, total ${item.total}`);
      answer = parts.length ? `Load by assignee: ${parts.join(" | ")}.` : "No tasks assigned yet.";
    } else if (prompt.includes("summarize") || prompt.includes("progress")) {
      answer = `Workspace progress: ${completed.length} completed, ${pending.length} pending. Recent activity: ${
        activity.length ? activity.slice(0, 3).map((a) => a.description).join(" | ") : "none"
      }.`;
    } else if (prompt.includes("notes") && prompt.includes("week")) {
      if (!notesThisWeek.length) {
        answer = "No notes were created this week.";
      } else {
        answer = `Notes this week: ${notesThisWeek
          .map((n) => n.title)
          .slice(0, 10)
          .join(", ")}.`;
      }
    } else if (prompt.includes("notes") && prompt.includes("trend")) {
      answer = `Notes trend: this week ${notesThisWeek.length}, last week ${lastWeek.length}.`;
    } else if (prompt.includes("follow-up") || prompt.includes("action item")) {
      const latest = notes[0];
      if (!latest?.content) {
        answer = "No recent note content to extract action items from.";
      } else {
        const lines = latest.content.split(/\r?\n/);
        const actions = lines
          .map((l) => l.trim())
          .filter((l) => l && (/^[-*]/.test(l) || /\b(todo|need to|action|fix|design)\b/i.test(l)))
          .slice(0, 5);
        answer = actions.length
          ? `From your latest note (${latest.title}), suggested follow-ups: ${actions.join(" | ")}.`
          : "No clear action items detected in the latest note.";
      }
    } else {
      answer = `Snapshot: ${tasks.length} tasks total (${completed.length} done, ${pending.length} pending). Notes: ${
        notes.length
      } total, ${notesThisWeek.length} this week. Ask things like "What tasks are due today?" or "Summarize my workspace progress."`;
    }

    await recordUsageEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      eventType: "ai_assistant"
    });

    return res.status(200).json({
      answer,
      meta: {
        total_tasks: tasks.length,
        completed_tasks: completed.length,
        pending_tasks: pending.length,
        notes_this_week: notesThisWeek.length,
        overdue: overdue.length,
        next_7_days: next7.length
      }
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
