import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import {
  canDeleteTask,
  listWorkspaceMembers,
  resolveWorkspaceContextFromRequest
} from "../../../lib/workspaceServer";

function normalizeTaskStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "progress") return "in_progress";
  if (["todo", "in_progress", "done"].includes(value)) return value;
  return null;
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
    status: normalizeTaskStatus(task?.status) || "todo",
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
  if (!["PUT", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: false
    });
    const taskId = Number(req.query.id);

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (!Number.isFinite(taskId)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const { data: existingTask, error: existingError } = await supabase
      .from("tasks")
      .select("id,title,status,user_id,workspace_id,assigned_to,due_date,created_at")
      .eq("id", taskId)
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ error: existingError.message });
    }

    if (!existingTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (req.method === "DELETE") {
      if (!canDeleteTask(context.role)) {
        return res.status(403).json({ error: "Only workspace owners and admins can delete tasks" });
      }

      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("workspace_id", context.workspace.id);

      if (error) return res.status(500).json({ error: error.message });

      await recordWorkspaceEvent(supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "task_deleted",
        notificationTitle: "Task deleted",
        notificationBody: existingTask.title,
        actionType: "task_deleted",
        activityDescription: `Deleted task "${existingTask.title}"`,
        entityType: "task",
        entityId: existingTask.id,
        metadata: {
          status: existingTask.status
        }
      });

      return res.status(200).json({ success: true });
    }

    const updates = {};
    const metadata = {};

    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) {
        return res.status(400).json({ error: "Task title is required" });
      }
      updates.title = title;
    }

    if (typeof req.body?.status === "string") {
      const status = normalizeTaskStatus(req.body.status);
      if (!status) {
        return res.status(400).json({ error: "Invalid task status" });
      }
      updates.status = status;
      metadata.status = {
        from: normalizeTaskStatus(existingTask.status),
        to: status
      };
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "due_date")) {
      updates.due_date = sanitizeDueDate(req.body?.due_date);
      metadata.due_date = updates.due_date;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "assigned_to")) {
      updates.assigned_to = req.body?.assigned_to ? Number(req.body.assigned_to) : null;
      if (updates.assigned_to) {
        const { data: assigneeMembership } = await supabase
          .from("workspace_members")
          .select("id,user_id")
          .eq("workspace_id", context.workspace.id)
          .eq("user_id", updates.assigned_to)
          .eq("status", "active")
          .maybeSingle();

        if (!assigneeMembership) {
          return res.status(400).json({ error: "Assignee must be an active workspace member" });
        }
      }
      metadata.assigned_to = {
        from: existingTask.assigned_to,
        to: updates.assigned_to
      };
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No task changes provided" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("workspace_id", context.workspace.id)
      .select("id,title,status,user_id,workspace_id,assigned_to,due_date,created_at")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const previousStatus = normalizeTaskStatus(existingTask?.status);
    const nextStatus = normalizeTaskStatus(data?.status);
    let activityDescription = `Updated task "${data?.title || existingTask?.title || "Task"}"`;
    let notificationTitle = "Task updated";
    let notificationType = "task_updated";

    if (metadata.assigned_to && metadata.assigned_to.from !== metadata.assigned_to.to) {
      activityDescription = `Reassigned task "${data?.title || existingTask?.title || "Task"}"`;
      notificationTitle = "Task reassigned";
      notificationType = "task_reassigned";
    } else if (previousStatus && nextStatus && previousStatus !== nextStatus) {
      if (nextStatus === "done") {
        activityDescription = `Completed task "${data?.title || existingTask?.title || "Task"}"`;
        notificationTitle = "Task completed";
        notificationType = "task_completed";
      } else {
        activityDescription = `Moved task "${data?.title || existingTask?.title || "Task"}" to ${String(nextStatus).replace("_", " ")}`;
        notificationTitle = "Task status updated";
        notificationType = "task_moved";
      }
    }

    await recordWorkspaceEvent(supabase, {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      notifyAllMembers: true,
      notificationType,
      notificationTitle,
      notificationBody: data?.title || existingTask?.title || "Task",
      actionType: notificationType,
      activityDescription,
      entityType: "task",
      entityId: data?.id,
      metadata
    });

    const membersByUserId = await buildMembersByUserId(supabase, context.workspace.id);
    return res.status(200).json({ task: mapTask(data, membersByUserId) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
