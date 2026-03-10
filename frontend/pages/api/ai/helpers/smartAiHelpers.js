const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
const OPENAI_ENABLED = process.env.OPENAI_ENABLED === "true";

export async function summarizeText(text) {
  if (OPENAI_ENABLED && OPENAI_API_KEY) {
    return callOpenAI({
      system:
        "Summarize the user's notes clearly and concisely. Prefer short paragraphs or bullets. Preserve important facts and action items.",
      userText: text
    });
  }
  return fallbackSummary(text);
}

export async function taskText(text) {
  if (OPENAI_ENABLED && OPENAI_API_KEY) {
    return callOpenAI({
      system:
        "Convert the user's request into a clear actionable task list. Use a numbered list. Be specific and practical.",
      userText: text
    });
  }
  return fallbackTasks(text);
}

export async function improveText(text) {
  if (OPENAI_ENABLED && OPENAI_API_KEY) {
    return callOpenAI({
      system:
        "Improve the user's writing for clarity, grammar, and professionalism while preserving the original meaning. Return only the improved text.",
      userText: text
    });
  }
  return fallbackImprove(text);
}

async function callOpenAI({ system, userText }) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText }
      ],
      temperature: 0.4
    })
  });

  const data = await response.json().catch(() => ({}));
  const result = data?.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !result) {
    throw new Error(result || data?.error?.message || "OpenAI request failed.");
  }
  return result;
}

function fallbackSummary(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("Please provide text to summarize.");
  return `Summary:\n${lines.slice(0, 6).map((l) => `- ${l}`).join("\n")}`;
}

function fallbackTasks(text) {
  const base = String(text || "").trim();
  if (!base) throw new Error("Please provide text to convert into tasks.");
  const items = base
    .split(/[,.;]\s+|\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);
  return items.map((item, idx) => `${idx + 1}. ${item}`).join("\n");
}

function fallbackImprove(text) {
  const normalized = String(text || "").trim();
  if (!normalized) throw new Error("Please provide text to improve.");
  const lower = normalized.toLowerCase();

  // Targeted patterns for tiny inputs
  const myNameMatch = lower.match(/^my name\s+(.+)/i);
  if (myNameMatch) {
    const name = myNameMatch[1].trim().replace(/[.?!"]+$/, "");
    return `My name is ${capitalize(name)}.`;
  }

  if (/^what\s+your\s+name\??$/.test(lower)) {
    return "What is your name?";
  }

  let improved = normalized;
  improved = capitalize(improved);
  if (!/[.!?]$/.test(improved)) improved += ".";
  return improved;
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
