import { getSupabaseServerClient } from "../../../lib/supabaseServer";

function resolveUserId(requestedUserId) {
  if (requestedUserId) return Number(requestedUserId);
  return null;
}

async function resolveUser(supabase, requestedUserId, requestedEmail) {
  let query = supabase.from("users").select("id,name,email,created_at");
  const numericUserId = resolveUserId(requestedUserId);
  const email = String(requestedEmail || "").trim().toLowerCase();

  if (numericUserId) {
    query = query.eq("id", numericUserId);
  } else if (email) {
    query = query.eq("email", email);
  } else {
    query = query.order("created_at", { ascending: true }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

function normalizeTitle(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 80) : "New chat";
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseServerClient();

    if (req.method === "GET") {
      const user = await resolveUser(supabase, req.query.user_id, req.query.email);
      const userId = user?.id || null;

      let query = supabase
        .from("ai_conversations")
        .select("id,user_id,title,created_at,updated_at")
        .order("updated_at", { ascending: false });

      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ conversations: data || [] });
    }

    if (req.method === "POST") {
      const user = await resolveUser(supabase, req.body?.user_id, req.body?.email);
      const userId = user?.id || null;
      const payload = {
        title: normalizeTitle(req.body?.title),
        updated_at: new Date().toISOString()
      };
      if (userId) payload.user_id = userId;

      const { data, error } = await supabase
        .from("ai_conversations")
        .insert(payload)
        .select("id,user_id,title,created_at,updated_at")
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ conversation: data });
    }

    if (req.method === "DELETE") {
      const user = await resolveUser(supabase, req.body?.user_id, req.body?.email);
      const userId = user?.id || null;

      let query = supabase.from("ai_conversations").delete();
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
