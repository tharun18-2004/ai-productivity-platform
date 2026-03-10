import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { canManageWorkspace, resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

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

    if (!canManageWorkspace(context.role)) {
      return res.status(403).json({ error: "Only workspace owners and admins can add demo sales." });
    }

    const demoRows = [
      { product: "Pro Plan", price: 499.0, customer: "Acme Labs", date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString() },
      { product: "AI Add-on", price: 299.0, customer: "Northwind", date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
      { product: "Team Seats", price: 799.0, customer: "Globex", date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() },
      { product: "Consulting Pack", price: 1299.0, customer: "Initech", date: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() }
    ];

    const { error: insertError } = await supabase.from("sales").insert(demoRows);
    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(200).json({ success: true, inserted: demoRows.length });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
