import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { resolveWorkspaceContextFromRequest } from "../../../lib/workspaceServer";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_AUDIO_MODEL = process.env.OPENAI_AUDIO_MODEL || "whisper-1";
const OPENAI_AUDIO_URL = process.env.OPENAI_AUDIO_URL || "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_ENABLED = process.env.OPENAI_ENABLED === "true";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb"
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await resolveWorkspaceContextFromRequest(req, {
      supabase,
      createUserIfMissing: true
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(401).json({ error: "Not authorized" });
    }

    if (!OPENAI_ENABLED || !OPENAI_API_KEY) {
      return res.status(503).json({ error: "OpenAI is disabled or missing API key" });
    }

    const base64 = String(req.body?.audioBase64 || "").trim();
    const mimeType = String(req.body?.mimeType || "audio/webm").trim();
    if (!base64) {
      return res.status(400).json({ error: "audioBase64 is required" });
    }

    const buffer = Buffer.from(base64, "base64");
    const file = new Blob([buffer], { type: mimeType || "audio/webm" });
    const form = new FormData();
    form.append("file", file, `voice-note.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
    form.append("model", OPENAI_AUDIO_MODEL);

    const response = await fetch(OPENAI_AUDIO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: form
    });

    const data = await response.json().catch(() => ({}));
    const text = data?.text || data?.choices?.[0]?.text || "";
    if (!response.ok || !text) {
      return res
        .status(response.status || 500)
        .json({ error: data?.error?.message || "Transcription failed" });
    }

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
