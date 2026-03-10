import { getSupabaseServerClient } from "./supabaseServer";

const DAILY_CAP = 25;

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function recordUsageEvent(supabase, { workspaceId, userId, eventType }) {
  if (!supabase || !workspaceId || !eventType) return;
  try {
    await supabase.from("usage_events").insert({
      workspace_id: workspaceId,
      user_id: userId || null,
      event_type: eventType
    });
  } catch (err) {
    // ignore missing table / quotas to avoid blocking main action
  }
}

export async function getUsageRemaining(supabase, { workspaceId, total = DAILY_CAP }) {
  if (!supabase || !workspaceId) {
    return { remaining: total, total };
  }

  // Try counting usage_events for today; if table missing, fallback to total
  const { start, end } = todayRange();
  try {
    const { count, error } = await supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", start)
      .lt("created_at", end);

    if (error) {
      return { remaining: total, total };
    }

    const used = count || 0;
    return { remaining: Math.max(total - used, 0), total };
  } catch (err) {
    return { remaining: total, total };
  }
}

export async function getUsageRemainingWithClient(options = {}) {
  const supabase = getSupabaseServerClient();
  return getUsageRemaining(supabase, options);
}
