import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const suggestions = [
  "Summarize these meeting notes",
  "Convert this text into tasks",
  "Improve this writing",
  "Generate a project plan",
  "Extract action items"
];

const examplePrompts = [
  "Summarize these meeting notes",
  "Convert this text into tasks",
  "Improve this writing",
  "Generate a project plan",
  "Extract action items"
];

const HISTORY_KEY = "ai_smart_history";

export default function SmartAssistant() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [intent, setIntent] = useState([]);
  const [savingTasks, setSavingTasks] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        setHistory(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveHistory = (entry) => {
    const next = [entry, ...history].slice(0, 20);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const deleteHistory = (id) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const runAI = async () => {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setError("");
    setResults(null);
    setIntent([]);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/ai/workspace-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          email: user?.email || ""
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "AI request failed");
      }
      setResults(data.results);
      setIntent(data.intent || []);
      saveHistory({
        id: Date.now(),
        input: text,
        intent: data.intent || [],
        results: data.results,
        ts: new Date().toISOString()
      });
    } catch (err) {
      setError(err?.message || "AI request failed");
    } finally {
      setLoading(false);
    }
  };

  const tasks = useMemo(() => (results?.tasks || []).map(toSentenceCase), [results]);
  const actionItems = useMemo(() => {
    const list = results?.action_items || results?.tasks || [];
    return list.map(toSentenceCase);
  }, [results]);

  const summaryText = results ? stripSummaryLabel(results.summary) || "None detected." : null;
  const improvedText = results ? results.improved || "None detected." : null;
  const planText = results ? results.project_plan || "None detected." : null;
  const tasksContent =
    results && (tasks.length ? (
      <ul className="list-disc pl-5 space-y-1">
        {tasks.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    ) : (
      "None detected."
    ));
  const actionsContent =
    results && (actionItems.length ? (
      <ul className="list-disc pl-5 space-y-1">
        {actionItems.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    ) : (
      "None detected."
    ));

  const addTasksToBoard = async () => {
    if (!tasks.length) return;
    setSavingTasks(true);
    setError("");
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const email = user?.email || "";
      for (const title of tasks) {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, title, status: "todo" })
        });
      }
    } catch (err) {
      setError(err?.message || "Could not add tasks to board");
    } finally {
      setSavingTasks(false);
    }
  };

  const loadHistory = (entry) => {
    setInput(entry.input);
    setResults(entry.results);
    setIntent(entry.intent || []);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Smart Suggestions</p>
            <p className="text-sm text-slate-300">Click to autofill</p>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-indigo-400"
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">History</p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">No saved requests yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-left text-xs text-slate-200"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => loadHistory(item)}
                    className="flex-1 text-left hover:text-indigo-200"
                  >
                    <p className="font-semibold text-slate-100">
                      {item.intent?.join(", ") || "auto"}
                    </p>
                    <p className="line-clamp-2 text-slate-400">{item.input}</p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(item.ts).toLocaleString()}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteHistory(item.id)}
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-rose-400 hover:text-rose-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <header className="mb-3">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">AI Workspace Assistant</p>
          <h1 className="text-xl font-semibold text-white">Type anything</h1>
          <p className="text-sm text-slate-400">
            Examples: {examplePrompts.join(" • ")}
          </p>
        </header>
        <div className="space-y-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder="Type anything..."
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {intent.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-[11px] uppercase tracking-wide text-indigo-100"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runAI}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Running..." : "Run AI"}
              </button>
              {tasks.length ? (
                <button
                  type="button"
                  onClick={addTasksToBoard}
                  disabled={savingTasks}
                  className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-60"
                >
                  {savingTasks ? "Adding..." : "Add Tasks to Board"}
                </button>
              ) : null}
            </div>
          </div>
          {error ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
              {error.toLowerCase().includes("sign in") ? " Please log in again and retry." : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              Thinking...
            </div>
          ) : null}
          {results ? (
            <>
              <Card title="Summary" content={summaryText} />
              <Card title="Tasks" content={tasksContent} />
              <Card title="Improved Text" content={improvedText} />
              <Card title="Action Items" content={actionsContent} />
              <Card
                title="Project Plan"
                content={planText ? <pre className="whitespace-pre-wrap">{planText}</pre> : "None detected."}
              />
            </>
          ) : !loading ? (
            <p className="text-sm text-slate-500">Run AI to see structured output here.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Card({ title, content }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="text-sm text-slate-200">{content}</div>
    </div>
  );
}

function toSentenceCase(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return capped.replace(/\s+/g, " ");
}

function stripSummaryLabel(text) {
  return String(text || "").replace(/^summary:\s*/i, "").trim();
}
