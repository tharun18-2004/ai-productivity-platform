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
  const normalized = basicNormalize(String(text || ""));
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

  // For very short, non-list inputs, try a grammar fixer
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const looksLikeList = /[,•\-;\n]/.test(normalized);
  if (wordCount <= 8 && !looksLikeList) {
    const fixed = fixShortSentence(normalized);
    if (fixed) return fixed;
  }

  // Fix a couple of very short, common typos (e.g., "todayi s tuesday")
  let improved = normalized
    .replace(/\btodayi\s*s\b/gi, "today is")
    .replace(/\btoday\s*i[s']?\b/gi, "today is")
    .replace(/\btoday\s*is\s*/gi, "today is ")
    .replace(/^(this|that)\s+not\b/i, (m, pron) => `${capitalize(pron)} is not`)
    .replace(/^i\s+good\s+boy\b/i, "I am a good boy")
    .replace(/^i\s+good\b/i, "I am good")
    .replace(/\s{2,}/g, " ")
    .trim();

  // If pattern is "today <weekday>", insert "is"
  const todayWeekday = improved.match(/^today\s+([a-z]+)$/i);
  if (todayWeekday) {
    const weekday = capitalize(todayWeekday[1]);
    improved = `Today is ${weekday}`;
  }

  improved = capitalize(improved);
  improved = capitalizeWeekdays(improved);
  if (!/[.!?]$/.test(improved)) improved += ".";
  return improved;
}

function basicNormalize(str) {
  return str
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fixShortSentence(input) {
  const original = input.trim();
  if (!original) return null;
  const lower = original.toLowerCase();
  const hasVerb = /\b(is|are|am|'s|was|were)\b/.test(lower);
  if (hasVerb) return handleWasWereGo(lower, original);

  const tokens = lower.split(/\s+/);
  if (!tokens.length) return null;

  const subject = tokens[0];
  const restTokens = tokens.slice(1);
  if (!restTokens.length) return null;

  const copulas = {
    i: "am",
    you: "are",
    we: "are",
    they: "are",
    those: "are",
    these: "are",
    he: "is",
    she: "is",
    it: "is",
    this: "is",
    that: "is",
    today: "is",
    tomorrow: "is",
    yesterday: "is"
  };

  if (!(subject in copulas)) return null;

  const adjectives = new Set([
    "good",
    "bad",
    "great",
    "ready",
    "done",
    "fine",
    "busy",
    "available",
    "ok",
    "okay",
    "correct",
    "wrong",
    "happy",
    "sad"
  ]);

  const negation = restTokens[0] === "not";
  const adjToken = negation ? restTokens[1] : restTokens[0];
  if (!adjToken) return null;
  if (!adjectives.has(adjToken)) return null;

  const subjectFixed = subject === "i" ? "I" : capitalize(subject);
  const verb = copulas[subject];
  const tail = negation ? `not ${adjToken}` : adjToken;

  let sentence = `${subjectFixed} ${verb} ${tail}`;
  sentence = capitalizeWeekdays(sentence);
  if (!/[.!?]$/.test(sentence)) sentence += ".";
  return sentence;
}

function handleWasWereGo(lower, original) {
  // Detect patterns like "i was go home" / "we were go office"
  const match = lower.match(/^(i|you|we|they|those|these|he|she|it|this|that)\s+(was|were)\s+go\s+(.*)$/);
  if (!match) return null;
  const subject = match[1];
  const tense = match[2]; // was | were
  const rest = match[3].trim();
  if (!rest) return null;

  const verb = tense === "were" ? "were going" : "was going";
  const subjectFixed = subject === "i" ? "I" : capitalize(subject);
  let sentence = `${subjectFixed} ${verb} ${rest}`;
  sentence = capitalizeWeekdays(sentence);
  if (!/[.!?]$/.test(sentence)) sentence += ".";
  return sentence;
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function capitalizeWeekdays(str) {
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today"];
  return str.replace(/\b([a-z]+)\b/gi, (match) => {
    return weekdays.includes(match.toLowerCase()) ? capitalize(match.toLowerCase()) : match;
  });
}

// Exported for lightweight fixture testing
export const _testHelpers = { fixShortSentence, fallbackImprove };
