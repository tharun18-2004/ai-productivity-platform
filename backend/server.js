const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const tasksRoutes = require("./routes/tasks");
const analyticsRoutes = require("./routes/analytics");
const store = require("./data/store");

const loadLocalEnv = () => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadLocalEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const HF_API_TOKEN = process.env.HF_API_TOKEN;
const HF_ROUTER_BASE_URL = process.env.HF_ROUTER_BASE_URL || "https://router.huggingface.co/hf-inference/models";
const HF_MODEL_ID = process.env.HF_MODEL_ID || "facebook/bart-large-cnn";
const HF_MODEL_URL = `${HF_ROUTER_BASE_URL.replace(/\/+$/, "")}/${HF_MODEL_ID}`;
const GREETING_RE = /^(hi|hello|hey|yo|hola|namaste|good morning|good afternoon|good evening)[!. ]*$/i;
const SMALL_TALK_RE = /^(how are you|how r you|what'?s up|sup|how'?s it going|who are you|thanks|thank you)[!?. ]*$/i;
const GREETING_RESPONSES = [
  "Hey! I am ready. Share notes to summarize, text to improve, or content to extract tasks from.",
  "Hi there. Send me your notes, and I can summarize, improve writing, or generate tasks.",
  "Hello. Paste what you are working on, and I will help you process it quickly."
];
let greetingReplyIndex = 0;
const SMALL_TALK_RESPONSES = [
  "I am doing well, thanks for asking. Share your text when you want me to help with writing, summaries, or tasks.",
  "Doing great. Send any draft or notes and I can improve, summarize, or turn them into action items.",
  "All good here. Paste what you are working on, and I will help right away."
];
let smallTalkReplyIndex = 0;

const buildPrompt = (task, text) => {
  if (task === "chat") {
    return `You are a helpful AI assistant for a productivity app. Reply conversationally and directly. Do not summarize unless asked. Keep answers clear and natural.\n\nUser:\n${text}\n\nAssistant:`;
  }

  if (task === "summarize") {
    return `Summarize the following notes in concise bullet points. If the notes are too short to summarize, ask for more context in one short sentence.\n\nNotes:\n${text}`;
  }

  if (task === "tasks") {
    return `Extract actionable tasks from the text below. Return a numbered task list. If there is not enough detail, ask for more context.\n\nText:\n${text}`;
  }

  if (task === "improve") {
    return `Improve the writing below for clarity and professionalism while preserving meaning. If the text is too short, ask for a longer draft.\n\nText:\n${text}`;
  }

  return null;
};

const parseHfOutput = (data) => {
  if (Array.isArray(data) && data.length > 0) {
    const item = data[0];
    if (typeof item?.generated_text === "string" && item.generated_text.trim()) {
      return item.generated_text.trim();
    }
    if (typeof item?.summary_text === "string" && item.summary_text.trim()) {
      return item.summary_text.trim();
    }
  }

  if (typeof data?.generated_text === "string" && data.generated_text.trim()) {
    return data.generated_text.trim();
  }

  return "No response generated";
};

const quickImproveShortText = (text) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();

  if (lower === "ho are you") return "How are you?";

  const sentence = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  if (/[.!?]$/.test(sentence)) return sentence;

  const questionStart = /^(how|what|why|when|where|who|is|are|am|do|does|did|can|could|would|should|will)\b/i;
  return questionStart.test(sentence) ? `${sentence}?` : `${sentence}.`;
};

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/notes", notesRoutes);
app.use("/tasks", tasksRoutes);
app.use("/analytics", analyticsRoutes);

const normalizeProviderError = (error) => {
  const status = error?.response?.status;
  const apiError = error?.response?.data?.error;
  const lower = String(apiError || "").toLowerCase();

  if (status === 401 || status === 403 || lower.includes("token") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "Invalid Hugging Face token or insufficient access.";
  }

  if (status === 429 || lower.includes("rate limit")) {
    return typeof apiError === "string" ? apiError : "Hugging Face rate limit reached. Please try again later.";
  }

  if (typeof apiError === "string" && apiError.trim()) {
    return apiError;
  }

  return "AI service error";
};

app.post("/ai/summarize", async (req, res) => {
  const { text } = req.body;
  const trimmedText = typeof text === "string" ? text.trim() : "";

  if (!trimmedText) {
    return res.status(400).json({ result: "Please provide text to summarize." });
  }

  if (!HF_API_TOKEN) {
    return res.status(500).json({
      result: "Missing HF_API_TOKEN in backend environment."
    });
  }

  try {
    store.ai_requests.push({
      id: Date.now(),
      user_id: Number(req.body?.user_id || 1),
      task: "summarize",
      created_at: new Date().toISOString()
    });

    const response = await axios.post(
      HF_MODEL_URL,
      { inputs: trimmedText },
      {
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const result = parseHfOutput(response.data);
    return res.json({ result });

  } catch (err) {
    const message = normalizeProviderError(err);
    return res.status(502).json({ result: message });
  }
});

app.post("/ai/process", async (req, res) => {
  const { task, text, history } = req.body || {};
  const trimmedText = typeof text === "string" ? text.trim() : "";
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  let effectiveTask = task;
  let autoSwitchedToImprove = false;

  if (!trimmedText) {
    return res.status(400).json({ result: "Please enter text first." });
  }

  store.ai_requests.push({
    id: Date.now(),
    user_id: Number(req.body?.user_id || 1),
    task: String(task || "chat"),
    created_at: new Date().toISOString()
  });

  if (GREETING_RE.test(trimmedText)) {
    const greetingReply = GREETING_RESPONSES[greetingReplyIndex % GREETING_RESPONSES.length];
    greetingReplyIndex += 1;
    return res.status(200).json({
      result: greetingReply
    });
  }

  if (SMALL_TALK_RE.test(trimmedText)) {
    const smallTalkReply = SMALL_TALK_RESPONSES[smallTalkReplyIndex % SMALL_TALK_RESPONSES.length];
    smallTalkReplyIndex += 1;
    return res.status(200).json({
      result: smallTalkReply
    });
  }

  if (wordCount < 4 && task !== "improve" && task !== "chat") {
    effectiveTask = "improve";
    autoSwitchedToImprove = true;
  }

  if (autoSwitchedToImprove) {
    const improved = quickImproveShortText(trimmedText);
    return res.status(200).json({
      result: `Auto-switched to Improve writing:\n${improved}`
    });
  }

  if (effectiveTask === "improve" && wordCount < 8) {
    return res.status(200).json({
      result: quickImproveShortText(trimmedText)
    });
  }

  const prompt =
    effectiveTask === "chat"
      ? buildChatPrompt(history, trimmedText)
      : buildPrompt(effectiveTask, trimmedText);
  if (!prompt) {
    return res.status(400).json({ result: "Invalid AI task requested." });
  }

  if (!HF_API_TOKEN) {
    return res.status(500).json({
      result: "Missing HF_API_TOKEN in backend environment."
    });
  }

  try {
    const response = await axios.post(
      HF_MODEL_URL,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 180,
          temperature: 0.1
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const result = parseHfOutput(response.data);
    const finalResult = autoSwitchedToImprove
      ? `Auto-switched to Improve writing:\n${result}`
      : result;

    return res.status(200).json({ result: finalResult });
  } catch (err) {
    const message = normalizeProviderError(err);
    return res.status(502).json({ result: message });
  }
});

function buildChatPrompt(history, text) {
  const normalizedHistory = Array.isArray(history)
    ? history
        .map((item) => ({
          role: String(item?.role || "").trim().toLowerCase(),
          content: String(item?.content || "").trim()
        }))
        .filter((item) => ["user", "assistant"].includes(item.role) && item.content)
        .slice(-12)
    : [];

  const lines = [
    "You are a helpful AI assistant for a productivity app.",
    "Reply conversationally and directly.",
    "Do not summarize unless asked.",
    "Answer like a natural assistant.",
    ""
  ];

  for (const item of normalizedHistory) {
    lines.push(`${item.role === "user" ? "User" : "Assistant"}: ${item.content}`);
  }

  lines.push(`User: ${text}`);
  lines.push("Assistant:");
  return lines.join("\n");
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
