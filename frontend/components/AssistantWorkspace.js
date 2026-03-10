import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useFreeUsage } from "../lib/useFreeUsage";

const initialTask = "summarize";

function buildEmptyChatMessage() {
  return {
    id: "empty-assistant",
    role: "assistant",
    content: "Paste notes or a draft. I can summarize text, generate tasks, or improve writing."
  };
}

function normalizeComparisonText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSmartTitle(message, conversationTitle) {
  const sourceTitle = String(conversationTitle || "").trim();
  const content = String(message?.content || "")
    .replace(/\s+/g, " ")
    .trim();
  const cleanSource = sourceTitle && sourceTitle.toLowerCase() !== "new request" ? sourceTitle : "";

  if (message?.task === "summarize") {
    const firstBullet = String(message?.content || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^[-*]\s+/.test(line));
    const bulletText = firstBullet ? firstBullet.replace(/^[-*]\s+/, "").trim() : "";
    const base = cleanSource || bulletText || content || "Summary";
    return `Summary: ${base}`.slice(0, 120);
  }

  if (message?.task === "tasks") {
    const firstTask = String(message?.content || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^\d+\.\s+/.test(line));
    const taskText = firstTask ? firstTask.replace(/^\d+\.\s+/, "").trim() : "";
    const base = cleanSource || taskText || content || "Task plan";
    return `Task plan: ${base}`.slice(0, 120);
  }

  const base = cleanSource || content || "Improved draft";
  return `Improved draft: ${base}`.slice(0, 120);
}

export default function AssistantWorkspace() {
  const router = useRouter();
  const [task, setTask] = useState(initialTask);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([buildEmptyChatMessage()]);
  const [renamingConversationId, setRenamingConversationId] = useState(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [convertingMessageId, setConvertingMessageId] = useState(null);
  const [copyingMessageId, setCopyingMessageId] = useState(null);
  const [exportingMessageId, setExportingMessageId] = useState(null);
  const [savingNoteMessageId, setSavingNoteMessageId] = useState(null);
  const [success, setSuccess] = useState("");
  const { remaining, total, loading: usageLoading, refreshUsage } = useFreeUsage();
  const messagesEndRef = useRef(null);
  const taskNames = {
    summarize: "summary",
    tasks: "task list",
    improve: "improved draft"
  };
  const taskHints = {
    summarize: "Paste raw notes, meeting text, or updates to turn them into a clean summary.",
    tasks: "Paste a goal, feature, or project idea to generate numbered tasks you can send to the board.",
    improve: "Paste rough writing to clean up grammar, tone, and clarity."
  };

  const trimmedText = text.trim();
  const usageRemaining =
    remaining === null || total === null ? null : Math.max(0, Number(remaining));
  const limitReached = usageRemaining !== null && usageRemaining <= 0;
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId) || null;
  const chatTitle = selectedConversation?.title || "New request";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const loadConversations = async () => {
      setSidebarLoading(true);
      setError("");
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        const params = new URLSearchParams();
        if (user?.email) params.set("email", user.email);
        const response = await fetch(params.toString() ? `/api/chats?${params.toString()}` : "/api/chats");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load conversations");
        }
        const nextConversations = data?.conversations || [];
        setConversations(nextConversations);
        setSelectedConversationId(nextConversations[0]?.id || null);
        setSuccess("");
      } catch (err) {
        setError(err?.message || "Unable to load conversations.");
      } finally {
        setSidebarLoading(false);
      }
    };

    loadConversations();
  }, []);

  useEffect(() => {
    const loadConversation = async () => {
      if (!selectedConversationId) {
        setMessages([buildEmptyChatMessage()]);
        return;
      }

      try {
        setError("");
        setSuccess("");
        const response = await fetch(`/api/chats/${selectedConversationId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load conversation");
        }
        const nextMessages = (data?.messages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          task: message.task
        }));
        setMessages(nextMessages.length ? nextMessages : [buildEmptyChatMessage()]);
      } catch (err) {
        setMessages([buildEmptyChatMessage()]);
        setError(err?.message || "Unable to load conversation.");
      }
    };

    loadConversation();
  }, [selectedConversationId]);

  const createConversation = async (preferredTitle = "New chat") => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user?.email || "",
        title: preferredTitle
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Could not create conversation");
    }
    const conversation = data?.conversation;
    setConversations((prev) => [conversation, ...prev]);
    setSelectedConversationId(conversation?.id || null);
    return conversation;
  };

  const sendMessage = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const content = text.trim();
    if (!content || loading) return;
    if (limitReached) {
      const cap = total ?? 25;
      setError(`Free plan AI limit reached. You have used ${cap} of ${cap} requests.`);
      setSuccess("");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setText("");

    const optimisticUserMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content,
      task
    };

    const nextMessages =
      messages.length === 1 && messages[0]?.id === "empty-assistant"
        ? [optimisticUserMessage]
        : [...messages, optimisticUserMessage];
    setMessages(nextMessages);

    let activeConversationId = selectedConversationId;

    try {
      let conversation = selectedConversation;
      if (!conversation) {
        conversation = await createConversation(content);
      }
      activeConversationId = conversation?.id || activeConversationId;

      const userMessageResponse = await fetch(`/api/chats/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content,
          task
        })
      });
      const savedUserMessageData = await userMessageResponse.json();
      if (!userMessageResponse.ok) {
        throw new Error(savedUserMessageData?.error || "Unable to save your message.");
      }

      const savedUserMessage = {
        id: savedUserMessageData?.message?.id || optimisticUserMessage.id,
        role: "user",
        content: savedUserMessageData?.message?.content || content,
        task: savedUserMessageData?.message?.task || task
      };

      setMessages((prev) => [
        ...prev.filter((item) => item.id !== optimisticUserMessage.id),
        savedUserMessage
      ]);

      const aiResponse = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          text: content,
          history: nextMessages
            .filter((item) => item.role === "user" || item.role === "assistant")
            .map((item) => ({
              role: item.role,
              content: item.content
            }))
            .slice(-12)
        })
      });
      const aiData = await aiResponse.json();
      const aiText = String(aiData?.result || "").trim();
      if (!aiResponse.ok) {
        throw new Error(aiText || "Unable to process request right now.");
      }

      const messageResponse = await fetch(`/api/chats/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: aiText,
          task
        })
      });
      const savedMessageData = await messageResponse.json();
      if (!messageResponse.ok) {
        throw new Error(savedMessageData?.error || "Unable to save assistant response.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: savedMessageData?.message?.id || `assistant-${Date.now()}`,
          role: "assistant",
          content: aiText,
          task
        }
      ]);
      refreshUsage?.();

      setConversations((prev) =>
        prev
          .map((item) =>
            item.id === conversation.id
              ? {
                  ...item,
                  title: item.title === "New chat" ? content.slice(0, 80) : item.title,
                  updated_at: new Date().toISOString()
                }
              : item
          )
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      );
    } catch (err) {
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((item) => item.id !== optimisticUserMessage.id);
        return withoutOptimistic.length ? withoutOptimistic : [buildEmptyChatMessage()];
      });
      if (!activeConversationId) {
        setText(content);
      }
      setError(err?.message || "Unable to process request right now.");
    } finally {
      setLoading(false);
    }
  };

  const startRename = (conversation) => {
    setRenamingConversationId(conversation.id);
    setRenamingTitle(conversation.title);
  };

  const saveRename = async () => {
    const title = renamingTitle.trim();
    if (!renamingConversationId || !title) return;

    try {
      const response = await fetch(`/api/chats/${renamingConversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not rename conversation");
      }

      setConversations((prev) =>
        prev.map((item) => (item.id === renamingConversationId ? data.conversation : item))
      );
      setRenamingConversationId(null);
      setRenamingTitle("");
      setSuccess("Request renamed.");
    } catch (err) {
      setError(err?.message || "Could not rename conversation.");
    }
  };

  const deleteConversation = async (conversation) => {
    const confirmed = window.confirm(`Delete "${conversation.title}"?`);
    if (!confirmed) return;

    try {
      setDeletingConversationId(conversation.id);
      const response = await fetch(`/api/chats/${conversation.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not delete conversation");
      }
      const remaining = conversations.filter((item) => item.id !== conversation.id);
      setConversations(remaining);
      setSelectedConversationId((current) =>
        current === conversation.id ? remaining[0]?.id || null : current
      );
      setSuccess("Request deleted.");
    } catch (err) {
      setError(err?.message || "Could not delete conversation.");
    } finally {
      setDeletingConversationId(null);
    }
  };

  const newChat = async () => {
    try {
      setError("");
      setSuccess("");
      await createConversation("New request");
      setMessages([buildEmptyChatMessage()]);
      setTask(initialTask);
    } catch (err) {
      setError(err?.message || "Could not create a new request.");
    }
  };

  const clearHistory = async () => {
    const confirmed = window.confirm("Clear all saved AI request history?");
    if (!confirmed) return;

    try {
      setClearingHistory(true);
      setError("");
      setSuccess("");
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || ""
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not clear history.");
      }

      setConversations([]);
      setSelectedConversationId(null);
      setMessages([buildEmptyChatMessage()]);
      setSuccess("History cleared.");
    } catch (err) {
      setError(err?.message || "Could not clear history.");
    } finally {
      setClearingHistory(false);
    }
  };

  const extractTaskItems = (content) =>
    String(content || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s+/.test(line))
      .map((line) => line.replace(/^\d+\.\s+/, "").trim())
      .filter(Boolean);

  const convertOutputToTasks = async (message) => {
    const taskItems = extractTaskItems(message?.content);
    if (!taskItems.length) {
      setError("No task items were found in this output.");
      setSuccess("");
      return;
    }

    setConvertingMessageId(message.id);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const email = user?.email || "";
      const existingTasksResponse = await fetch(
        email ? `/api/tasks?email=${encodeURIComponent(email)}` : "/api/tasks"
      );
      const existingTasksData = await existingTasksResponse.json();
      if (!existingTasksResponse.ok) {
        throw new Error(existingTasksData?.error || "Could not load existing tasks.");
      }

      const existingTitles = new Set(
        (existingTasksData?.tasks || []).map((item) => normalizeComparisonText(item?.title))
      );
      const uniqueTaskItems = Array.from(
        new Set(taskItems.map((item) => normalizeComparisonText(item)).filter(Boolean))
      ).map((normalizedItem) =>
        taskItems.find((item) => normalizeComparisonText(item) === normalizedItem)
      );
      let createdCount = 0;
      let skippedCount = 0;

      for (const title of uniqueTaskItems) {
        const normalizedTitle = normalizeComparisonText(title);
        if (existingTitles.has(normalizedTitle)) {
          skippedCount += 1;
          continue;
        }

        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            title,
            status: "todo"
          })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Could not create tasks from this output.");
        }
        existingTitles.add(normalizedTitle);
        createdCount += 1;
      }

      if (!createdCount && skippedCount) {
        setSuccess(`No new tasks added. Skipped ${skippedCount} duplicate tasks.`);
      } else if (skippedCount) {
        setSuccess(`Added ${createdCount} tasks and skipped ${skippedCount} duplicates.`);
      } else {
        setSuccess(`Added ${createdCount} tasks to the task board.`);
      }
      router.push("/tasks");
    } catch (err) {
      setError(err?.message || "Could not convert output to tasks.");
    } finally {
      setConvertingMessageId(null);
    }
  };

  const copyOutput = async (message) => {
    const content = String(message?.content || "").trim();
    if (!content) {
      setError("No output text available to copy.");
      setSuccess("");
      return;
    }

    try {
      setCopyingMessageId(message.id);
      setError("");
      setSuccess("");
      await navigator.clipboard.writeText(content);
      setSuccess("Output copied.");
    } catch {
      setError("Could not copy output.");
    } finally {
      setCopyingMessageId(null);
    }
  };

  const exportOutput = async (message) => {
    const content = String(message?.content || "").trim();
    if (!content) {
      setError("No output text available to export.");
      setSuccess("");
      return;
    }

    try {
      setExportingMessageId(message.id);
      setError("");
      setSuccess("");

      const label =
        message?.task === "summarize"
          ? "summary"
          : message?.task === "tasks"
            ? "task-plan"
            : "improved-draft";
      const title = String(selectedConversation?.title || "ai-output")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50) || "ai-output";
      const fileName = `${label}-${title}.txt`;

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess(`Exported ${fileName}.`);
    } catch {
      setError("Could not export output.");
    } finally {
      setExportingMessageId(null);
    }
  };

  const buildNotePayload = (message) => {
    return {
      title: buildSmartTitle(message, selectedConversation?.title),
      content: String(message?.content || "").trim(),
      category: message?.task === "tasks" ? "project" : message?.task === "summarize" ? "meeting" : "idea",
      tags: ["ai"],
      editor_mode: "markdown"
    };
  };

  const saveOutputAsNote = async (message) => {
    const content = String(message?.content || "").trim();
    if (!content) {
      setError("No output text available to save as a note.");
      setSuccess("");
      return;
    }

    try {
      setSavingNoteMessageId(message.id);
      setError("");
      setSuccess("");
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const payload = buildNotePayload(message);
      const existingNotesResponse = await fetch(
        user?.email ? `/api/notes?email=${encodeURIComponent(user.email)}` : "/api/notes"
      );
      const existingNotesData = await existingNotesResponse.json();
      if (!existingNotesResponse.ok) {
        throw new Error(existingNotesData?.error || "Could not load existing notes.");
      }

      const duplicateNote = (existingNotesData?.notes || []).find(
        (note) =>
          normalizeComparisonText(note?.title) === normalizeComparisonText(payload.title) &&
          normalizeComparisonText(note?.content) === normalizeComparisonText(payload.content)
      );
      if (duplicateNote) {
        setSuccess(`Note already exists: ${duplicateNote.title}`);
        router.push("/notes");
        return;
      }

      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "",
          ...payload
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not save output as a note.");
      }

      setSuccess(`Saved to notes: ${data?.note?.title || payload.title}`);
      router.push("/notes");
    } catch (err) {
      setError(err?.message || "Could not save output as a note.");
    } finally {
      setSavingNoteMessageId(null);
    }
  };

  const taskLabel = useMemo(() => {
    if (task === "summarize") return "Summarize notes";
    if (task === "tasks") return "Generate tasks";
    return "Improve writing";
  }, [task]);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">History</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              {conversations.length} saved {conversations.length === 1 ? "request" : "requests"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearHistory}
              disabled={clearingHistory || sidebarLoading || conversations.length === 0}
              className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-40"
            >
              {clearingHistory ? "Clearing..." : "Clear"}
            </button>
            <button
              type="button"
              onClick={newChat}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              + New request
            </button>
          </div>
        </div>

        {sidebarLoading ? <p className="text-xs text-slate-400">Loading history...</p> : null}
        {!sidebarLoading && conversations.length === 0 ? (
          <p className="text-xs text-slate-500">No saved requests yet.</p>
        ) : null}

        <div className="space-y-2">
          {conversations.map((conversation) => {
            const active = conversation.id === selectedConversationId;
            return (
              <div
                key={conversation.id}
                className={`rounded-xl border p-3 ${
                  active
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-800 bg-slate-950/70"
                }`}
              >
                {renamingConversationId === conversation.id ? (
                  <div className="space-y-2">
                    <input
                      value={renamingTitle}
                      onChange={(event) => setRenamingTitle(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveRename} className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-white">
                        Save
                      </button>
                      <button type="button" onClick={() => { setRenamingConversationId(null); setRenamingTitle(""); }} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className="block w-full text-left"
                    >
                      <p className="truncate text-sm font-semibold text-slate-100">{conversation.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {new Date(conversation.updated_at || conversation.created_at).toLocaleString()}
                      </p>
                    </button>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => startRename(conversation)} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConversation(conversation)}
                        disabled={deletingConversationId === conversation.id}
                        className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-200 disabled:opacity-50"
                      >
                        {deletingConversationId === conversation.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
        <header className="border-b border-slate-800 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{chatTitle}</h2>
              <p className="text-xs text-slate-400">{taskLabel}</p>
              <p className="mt-1 text-xs text-slate-500">{taskHints[task]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTask("summarize")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${task === "summarize" ? "bg-indigo-500 text-white" : "border border-slate-700 bg-slate-950 text-slate-300"}`}>
                Summarize
              </button>
              <button type="button" onClick={() => setTask("tasks")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${task === "tasks" ? "bg-indigo-500 text-white" : "border border-slate-700 bg-slate-950 text-slate-300"}`}>
                Tasks
              </button>
              <button type="button" onClick={() => setTask("improve")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${task === "improve" ? "bg-indigo-500 text-white" : "border border-slate-700 bg-slate-950 text-slate-300"}`}>
                Improve
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-slate-300">
              {usageLoading
                ? "Loading AI usage..."
                : remaining === null || total === null
                  ? "Free plan: loading"
                  : `Free plan: ${usageRemaining}/${total} left`}
            </span>
            <span
              className={`rounded-full px-3 py-1 ${
                limitReached
                  ? "bg-rose-500/10 text-rose-200"
                  : loading
                    ? "bg-amber-500/10 text-amber-200"
                    : "bg-emerald-500/10 text-emerald-200"
              }`}
            >
              {limitReached
                ? "Limit reached"
                : loading
                  ? `Processing ${taskNames[task]}...`
                  : usageRemaining === null
                    ? "Requests remaining: loading"
                    : `${usageRemaining} requests remaining`}
            </span>
          </div>
        </header>

        <div className="h-[540px] overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={`${message.id}-${index}`}
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-indigo-500 text-white"
                    : "mr-auto border border-slate-700 bg-slate-950 text-slate-200"
                }`}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase opacity-70">
                  {message.role === "user" ? "Input" : "Output"}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyOutput(message)}
                      disabled={copyingMessageId === message.id}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-40"
                    >
                      {copyingMessageId === message.id ? "Copying..." : "Copy output"}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportOutput(message)}
                      disabled={exportingMessageId === message.id}
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-40"
                    >
                      {exportingMessageId === message.id ? "Exporting..." : "Export output"}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveOutputAsNote(message)}
                      disabled={savingNoteMessageId === message.id}
                      className="rounded-md border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 disabled:opacity-40"
                    >
                      {savingNoteMessageId === message.id ? "Saving note..." : "Use output as note"}
                    </button>
                    {message.task === "tasks" ? (
                      <button
                        type="button"
                        onClick={() => convertOutputToTasks(message)}
                        disabled={convertingMessageId === message.id}
                        className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-40"
                      >
                        {convertingMessageId === message.id
                          ? "Adding to board..."
                          : "Convert to task board"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {loading ? (
              <div className="mr-auto rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                <p className="font-semibold text-slate-200">Generating {taskNames[task]}...</p>
                <p className="mt-1 text-xs text-slate-500">
                  Your request is being processed. Please wait before sending another one.
                </p>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-slate-800 p-4">
          {success ? (
            <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {success}
            </div>
          ) : null}
          {error ? (
            <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          ) : null}
          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-2">
            <p className="px-3 pt-2 text-xs text-slate-500">
              This tool supports summarize, tasks, and improve. It does not answer general questions.
            </p>
            {limitReached ? (
              <div className="mx-3 mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                You have reached the free AI usage limit for this workspace. Clear messaging remains available, but new AI runs are disabled.
              </div>
            ) : null}
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(event);
                }
              }}
              rows={3}
              placeholder="Paste notes, a task request, or a draft to improve..."
              className="min-h-[80px] w-full resize-none rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Press Enter to process, Shift+Enter for a new line.</p>
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !trimmedText || limitReached}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Processing..." : "Run"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
