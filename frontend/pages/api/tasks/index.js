import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import { listWorkspaceMembers, resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

function normalizeTaskStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "progress") return "in_progress";
  if (["todo", "in_progress", "done"].includes(value)) return value;
  return "todo";
}

function sanitizeDueDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function mapTask(task, membersByUserId) {
  const creator = task?.user_id ? membersByUserId.get(task.user_id) || null : null;
  const assignee = task?.assigned_to ? membersByUserId.get(task.assigned_to) || null : null;

  return {
    ...task,
    status: normalizeTaskStatus(task?.status),
    due_date: sanitizeDueDate(task?.due_date),
    creator,
    assignee
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
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,status,user_id,workspace_id,assigned_to,due_date,created_at,generated_by")
        .eq("workspace_id", context.workspace.id)
        .order("created_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      const membersByUserId = await buildMembersByUserId(supabase, context.workspace.id);
      return res.status(200).json({
        tasks: (data || []).map((task) => mapTask(task, membersByUserId)),
        workspace: context.workspace,
        role: context.role
      });
    }

    if (req.method === "POST") {
      const title = String(req.body?.title || "").trim();
      const status = normalizeTaskStatus(req.body?.status);
      const dueDate = sanitizeDueDate(req.body?.due_date);
      const requestedAssignee = req.body?.assigned_to ? Number(req.body.assigned_to) : null;

      if (!title) {
        return res.status(400).json({ error: "Task title is required" });
      }

      let assignedTo = requestedAssignee;
      if (assignedTo) {
        const { data: assigneeMembership } = await supabase
          .from("workspace_members")
          .select("id,user_id")
          .eq("workspace_id", context.workspace.id)
          .eq("user_id", assignedTo)
          .eq("status", "active")
          .maybeSingle();

        if (!assigneeMembership) {
          return res.status(400).json({ error: "Assignee must be an active workspace member" });
        }
      } else {
        assignedTo = context.user.id;
      }

      const payload = {
        title,
        status,
        user_id: context.user.id,
        workspace_id: context.workspace.id,
        assigned_to: assignedTo,
        due_date: dueDate
      };

      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select("id,title,status,user_id,workspace_id,assigned_to,due_date,created_at,generated_by")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await recordWorkspaceEvent(supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "task_created",
        notificationTitle: "Task created",
        notificationBody: title,
        actionType: "task_created",
        activityDescription: `Created task "${title}"`,
        entityType: "task",
        entityId: data?.id,
        metadata: {
          status,
          assigned_to: assignedTo,
          due_date: dueDate
        }
      });

      const membersByUserId = await buildMembersByUserId(supabase, context.workspace.id);
      return res.status(201).json({ task: mapTask(data, membersByUserId) });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
