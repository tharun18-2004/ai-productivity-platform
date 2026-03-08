import { useMemo, useState } from "react";

const initialMessage =
  "Hi, I can summarize notes, generate tasks, or improve writing. Paste your text below.";

export default function AIToolsPanel() {
  const [text, setText] = useState("");
  const [task, setTask] = useState("summarize");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: initialMessage }]);
  const [requestError, setRequestError] = useState("");

  const greetingRegex = /^(hi|hello|hey|yo|hola|namaste|good morning|good afternoon|good evening)[!. ]*$/i;
  const trimmedText = text.trim();
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const isGreeting = greetingRegex.test(trimmedText);
  const isTooShort = !!trimmedText && wordCount < 4;

  const inlineHint = useMemo(() => {
    if (!trimmedText) return "";
    if (isGreeting) return "Greeting detected: chat reply mode is active.";
    if (isTooShort && task !== "improve") return "Short input will auto-switch to Improve writing.";
    return "";
  }, [isGreeting, isTooShort, task, trimmedText]);

  const sendMessage = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setText("");
    setLoading(true);
    setRequestError("");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, text: trimmed })
      });
      const data = await response.json();
      const result = String(data?.result || "").trim();
      if (!response.ok) {
        throw new Error(result || "Unable to process request right now.");
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result || "No response generated." }
      ]);
    } catch (err) {
      const message = err?.message || "Unable to process request right now.";
      setRequestError(message);
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Assistant Actions</h3>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => setTask("summarize")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              task === "summarize" ? "bg-indigo-500 text-white" : "bg-slate-950 text-slate-300"
            }`}
          >
            Summarize notes
          </button>
          <button
            type="button"
            onClick={() => setTask("tasks")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              task === "tasks" ? "bg-indigo-500 text-white" : "bg-slate-950 text-slate-300"
            }`}
          >
            Generate tasks
          </button>
          <button
            type="button"
            onClick={() => setTask("improve")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              task === "improve" ? "bg-indigo-500 text-white" : "bg-slate-950 text-slate-300"
            }`}
          >
            Improve writing
          </button>
        </div>
      </aside>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
        <div className="h-[430px] space-y-3 overflow-y-auto border-b border-slate-800 p-4">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "ml-auto bg-indigo-500 text-white"
                  : "mr-auto border border-slate-700 bg-slate-950 text-slate-200"
              }`}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase opacity-70">{msg.role}</p>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
          {loading ? (
            <div className="mr-auto rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-400">
              Assistant is typing...
            </div>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-950 p-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(event);
                }
              }}
              rows={2}
              placeholder="Ask me anything..."
              className="min-h-[54px] flex-1 resize-none rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={sendMessage}
              disabled={loading || !trimmedText}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </div>
          {inlineHint ? <p className="mt-2 text-xs text-amber-300">{inlineHint}</p> : null}
          {requestError ? <p className="mt-2 text-xs text-rose-300">{requestError}</p> : null}
        </div>
      </section>
    </div>
  );
}
