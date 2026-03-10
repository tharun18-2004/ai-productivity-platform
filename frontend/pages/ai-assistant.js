import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

const suggestions = [
  "What tasks are due today?",
  "Summarize my workspace progress",
  "What notes were created this week?",
  "What's overdue?",
  "Who has the most tasks?",
  "What's due in the next 7 days?",
  "Show the notes trend"
];

export default function AiAssistantPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!active) return;
      if (!session?.user) {
        router.replace(`/login?next=${encodeURIComponent("/ai-assistant")}`);
        return;
      }
      setAuthed(true);
    };
    check();
    return () => {
      active = false;
    };
  }, [router]);

  const send = async (input) => {
    const question = input || prompt.trim();
    if (!question) return;
    setPrompt("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: question }]);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/ai/workspace-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email || "", prompt: question })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Assistant failed");
      setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: err?.message || "Sorry, something went wrong." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!authed) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 bg-slate-950 px-4 py-8 text-white">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.25em] text-indigo-300">AI Workspace Assistant</p>
        <h1 className="text-3xl font-bold">Ask about your workspace</h1>
        <p className="text-sm text-slate-400">
          Ask about tasks, notes, activity. Try a quick suggestion below.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-indigo-400"
              >
                {s}
              </button>
            ))}
          </div>
          <Link
            href="/dashboard"
            className="ml-auto rounded-full border border-indigo-500 px-3 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/10"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <section className="flex-1 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">Ask a question to get started.</p>
          ) : null}
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`rounded-xl border px-3 py-2 text-sm ${
                m.role === "user"
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-50"
                  : "border-slate-700 bg-slate-900 text-slate-100"
              }`}
            >
              {m.text}
            </div>
          ))}
          {loading ? (
            <div className="text-sm text-slate-400">Thinking...</div>
          ) : null}
        </div>
      </section>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask about tasks, notes, or activity..."
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </main>
  );
}
