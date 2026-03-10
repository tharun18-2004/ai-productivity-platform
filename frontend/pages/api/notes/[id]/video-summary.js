import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { resolveWorkspaceContextFromRequest } from "../../../../lib/workspaceServer";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
const OPENAI_ENABLED = process.env.OPENAI_ENABLED === "true";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb"
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const noteId = Number(req.query.id);
  if (!Number.isFinite(noteId)) {
    return res.status(400).json({ error: "Invalid note id" });
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

    const bodyUrl = String(req.body?.video_url || "").trim();
    if (!bodyUrl) return res.status(400).json({ error: "video_url is required" });
    const videoId = extractYouTubeId(bodyUrl);
    if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

    const { data: noteData, error: noteError } = await supabase
      .from("notes")
      .select("id,workspace_id,video_summary,title")
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .maybeSingle();

    if (noteError) return res.status(500).json({ error: noteError.message });
    if (!noteData) return res.status(404).json({ error: "Note not found" });

    if (!OPENAI_ENABLED || !OPENAI_API_KEY) {
      return res.status(503).json({ error: "OpenAI is disabled or missing API key" });
    }

    const title = await fetchYouTubeTitle(videoId).catch(() => "");
    const transcript = await fetchTranscript(videoId).catch(() => "");

    const prompt = buildPrompt({ title, transcript, url: bodyUrl });
    const summary = await callOpenAI(prompt);

    const { data, error } = await supabase
      .from("notes")
      .update({ video_summary: summary })
      .eq("id", noteId)
      .eq("workspace_id", context.workspace.id)
      .select("id,video_summary")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ summary: data?.video_summary || summary });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}

function extractYouTubeId(url) {
  const value = String(url || "").trim();
  const patterns = [
    /youtu\\.be\\/([\\w-]{6,})/i,
    /youtube\\.com\\/(?:watch\\?v=|embed\\/|v\\/)([\\w-]{6,})/i,
    /youtube\\.com\\/.+?[?&]v=([\\w-]{6,})/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

async function fetchYouTubeTitle(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const response = await fetch(url);
  if (!response.ok) return "";
  const data = await response.json().catch(() => ({}));
  return data?.title || "";
}

async function fetchTranscript(videoId) {
  const response = await fetch(`https://youtubetranscript.com/?server_vid=${videoId}`);
  if (!response.ok) return "";
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data)) return "";
  return data
    .map((item) => item?.text || "")
    .filter(Boolean)
    .join(" ")
    .slice(0, 12000);
}

function buildPrompt({ title, transcript, url }) {
  const parts = [];
  if (title) parts.push(`Title: ${title}`);
  if (url) parts.push(`URL: ${url}`);
  if (transcript) {
    parts.push("Transcript:");
    parts.push(transcript);
  } else {
    parts.push("Transcript unavailable; summarize based on title and URL context. Keep it general.");
  }
  return `Summarize this video for a productively minded user.\nReturn bullet points under headings: Main Topic, Key Points, Important Concepts, Actionable Insights.\n\n${parts.join("\n\n")}`;
}

async function callOpenAI(userText) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: "You are a concise video summarizer for a productivity app." },
        { role: "user", content: userText }
      ],
      temperature: 0.3
    })
  });

  const data = await response.json().catch(() => ({}));
  const result = data?.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !result) {
    throw new Error(result || data?.error?.message || "OpenAI summary failed.");
  }
  return result;
}
