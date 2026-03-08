import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../../lib/serverActivity";

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ["user", "assistant"].includes(role) ? role : null;
}

function normalizeTask(value) {
  const task = String(value || "").trim().toLowerCase();
  return ["chat", "summarize", "tasks", "improve"].includes(task) ? task : "chat";
}

function deriveTitle(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 80) : "New chat";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const supabase = getSupabaseServerClient();
    const conversationId = Number(req.query.id);

    if (!Number.isFinite(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    const role = normalizeRole(req.body?.role);
    const content = String(req.body?.content || "").trim();
    const task = normalizeTask(req.body?.task);

    if (!role) {
      return res.status(400).json({ error: "Invalid message role" });
    }
    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const { data: message, error } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
        task
      })
      .select("id,conversation_id,role,content,task,created_at")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { data: conversationData } = await supabase
      .from("ai_conversations")
      .select("id,user_id,title")
      .eq("id", conversationId)
      .maybeSingle();

    const conversationUpdate = {
      updated_at: new Date().toISOString()
    };

    if (role === "user") {
      const { data: currentConversation } = await supabase
        .from("ai_conversations")
        .select("title")
        .eq("id", conversationId)
        .maybeSingle();

      const currentTitle = String(currentConversation?.title || "").trim().toLowerCase();
      if (!currentTitle || currentTitle === "new chat") {
        conversationUpdate.title = deriveTitle(content);
      }
    }

    await supabase.from("ai_conversations").update(conversationUpdate).eq("id", conversationId);

    if (role === "assistant") {
      const { data: membershipData } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", conversationData?.user_id || -1)
        .eq("status", "active")
        .maybeSingle();

      await recordWorkspaceEvent(supabase, {
        workspaceId: membershipData?.workspace_id || null,
        userId: conversationData?.user_id || null,
        notifyAllMembers: true,
        notificationType: "ai_used",
        notificationTitle: "AI tool used",
        notificationBody: `Generated ${task}`,
        actionType: "ai_used",
        activityDescription: `Used AI ${task}${conversationData?.title ? ` in "${conversationData.title}"` : ""}`,
        entityType: "ai_message",
        entityId: message?.id,
        metadata: {
          task
        }
      });
    }

    return res.status(201).json({ message });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
