export async function recordWorkspaceEvent(
  supabase,
  {
    workspaceId = null,
    userId = null,
    recipientUserIds = [],
    notifyAllMembers = false,
    notificationType = "",
    notificationTitle = "",
    notificationBody = "",
    actionType = "",
    activityDescription = "",
    entityType = "",
    entityId = null,
    metadata = {}
  }
) {
  if (!supabase || !workspaceId) return;

  const writes = [];

  if (actionType && activityDescription) {
    writes.push(
      supabase.from("activity_logs").insert({
        workspace_id: workspaceId,
        user_id: userId,
        action_type: actionType,
        description: activityDescription,
        entity_type: entityType || null,
        entity_id: Number.isFinite(Number(entityId)) ? Number(entityId) : null,
        metadata
      })
    );
  }

  if (notificationType && notificationTitle) {
    let recipientIds = Array.isArray(recipientUserIds)
      ? recipientUserIds.map((value) => Number(value)).filter(Number.isFinite)
      : [];

    if (notifyAllMembers || recipientIds.length === 0) {
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "active");

      recipientIds = (members || [])
        .map((member) => Number(member.user_id))
        .filter((memberUserId) => Number.isFinite(memberUserId) && memberUserId !== Number(userId));
    }

    if (!recipientIds.length && Number.isFinite(Number(userId))) {
      recipientIds = [Number(userId)];
    }

    writes.push(
      supabase.from("notifications").insert(
        recipientIds.map((recipientUserId) => ({
          workspace_id: workspaceId,
          user_id: recipientUserId,
          type: notificationType,
          title: notificationTitle,
          body: notificationBody || "",
          entity_type: entityType || null,
          entity_id: Number.isFinite(Number(entityId)) ? Number(entityId) : null
        }))
      )
    );
  }

  if (!writes.length) return;

  await Promise.allSettled(writes);
}

export function formatRelativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "just now";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}
