import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordUsageEvent } from "../../../lib/usageServer";
import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";
import { summarizeText, taskText, improveText } from "./helpers/smartAiHelpers";

function detectIntent(text) {
  const lower = text.toLowerCase();
  const intents = new Set();
  if (/(improve|rewrite|polish|clean up)/.test(lower)) intents.add("improve");
  if (/(task|todo|to-do|action item|action-item|convert.*tasks)/.test(lower)) intents.add("tasks");
  if (/(summarize|summary|meeting notes|notes:)/.test(lower)) intents.add("summary");
  if (/(plan|roadmap|steps|project plan)/.test(lower)) intents.add("plan");
  if (/(action items?|follow-ups?|follow ups?)/.test(lower)) intents.add("actions");
  if (!intents.size) {
    intents.add("summary");
    intents.add("tasks");
    intents.add("actions");
  }
  return Array.from(intents);
}

function normalizeText(text) {
  return String(text || "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractItems(text, max = 10) {
  let normalized = normalizeText(text);
  // Strip common command prefixes
  normalized = normalized.replace(/^(convert this text into tasks:|meeting notes:|notes:|tasks:)\s*/i, "");

  if (!normalized) return [];
  const parts = normalized
    .split(/[\r\n]+|[•\-]\s+|(?<=[.;])\s+|,\s+/)
    .map((p) =>
      p
        .replace(/^[\d\s.()-]+\s*/, "") // drop leading numbers/bullets
        .replace(/[.;,]\s*$/, "") // drop trailing punctuation
        .trim()
    )
    .filter(
      (p) =>
        p.length >= 3 &&
        !/^convert this text/i.test(p) &&
        !/^summarize and extract/i.test(p) &&
        !/^meeting notes/i.test(p)
    );
  const seen = new Set();
  const items = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      items.push(p);
    }
    if (items.length >= max) break;
  }
  return items;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    let supabase;
    let canLogUsage = true;
    try {
      supabase = getSupabaseServerClient();
    } catch (e) {
      // fallback to anon client (read-only) so AI still works
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) {
        return res.status(500).json({ error: "Supabase configuration missing." });
      }
      supabase = createClient(url, anon, { auth: { persistSession: false } });
      canLogUsage = false;
    }

    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: true,
      ensureWorkspace: true
    });

    if (!context.user) {
      return res.status(401).json({ error: "Please sign in to use the assistant." });
    }

    const intents = detectIntent(text);

    const results = {};
    if (intents.includes("summary")) {
      results.summary = await summarizeText(text);
    }
    if (intents.includes("tasks") || intents.includes("plan")) {
      const taskOutput = await taskText(text);
      results.tasks_raw = taskOutput;
      results.tasks = extractItems(taskOutput, 10);
    }
    if (intents.includes("improve")) {
      results.improved = await improveText(text);
    }
    if (intents.includes("plan")) {
      results.project_plan = results.tasks?.length
        ? results.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : await taskText(text);
    }
    if (intents.includes("actions")) {
      const actionCandidates = extractItems(text, 10);
      const verbs = /(finish|fix|deploy|test|review|ship|build|prepare|check|complete)/i;
      let actions = actionCandidates.filter((item) => verbs.test(item));
      if (!actions.length && results.tasks?.length) {
        actions = results.tasks.slice(0, 8);
      }
      results.action_items = actions;
    }

    if (canLogUsage && context.workspace?.id) {
      await recordUsageEvent(supabase, {
        workspaceId: context.workspace?.id,
        userId: context.user?.id,
        eventType: "ai_smart"
      });
    }

    return res.status(200).json({
      intent: intents,
      results
    });
  } catch (err) {
    return res
      .status(err.statusCode || 500)
      .json({ error: err.message || "AI failed. Check your connection and try again." });
  }
}
