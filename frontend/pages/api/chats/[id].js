import { getSupabaseServerClient } from "../../../lib/supabaseServer";

function normalizeTitle(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 80) : "New chat";
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseServerClient();
    const conversationId = Number(req.query.id);

    if (!Number.isFinite(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id" });
    }

    if (req.method === "GET") {
      const { data: conversation, error: conversationError } = await supabase
        .from("ai_conversations")
        .select("id,user_id,title,created_at,updated_at")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) return res.status(500).json({ error: conversationError.message });
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });

      const { data: messages, error: messagesError } = await supabase
        .from("ai_messages")
        .select("id,conversation_id,role,content,task,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (messagesError) return res.status(500).json({ error: messagesError.message });

      return res.status(200).json({ conversation, messages: messages || [] });
    }

    if (req.method === "PUT") {
      const title = normalizeTitle(req.body?.title);
      const { data, error } = await supabase
        .from("ai_conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .select("id,user_id,title,created_at,updated_at")
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ conversation: data });
    }

    if (req.method === "DELETE") {
      const { error } = await supabase.from("ai_conversations").delete().eq("id", conversationId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
