import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useWorkspaceContext } from "../lib/workspaceClient";
import SharedNoteBanner from "./notes/SharedNoteBanner";

const seedNotes = [];
const categoryOptions = ["idea", "bug", "meeting", "project"];
const categoryStyles = {
  idea: "bg-cyan-500/10 text-cyan-200 border-cyan-400/20",
  bug: "bg-rose-500/10 text-rose-200 border-rose-400/20",
  meeting: "bg-amber-500/10 text-amber-200 border-amber-400/20",
  project: "bg-emerald-500/10 text-emerald-200 border-emerald-400/20"
};
const editorTools = [
  { label: "H1", action: "heading1" },
  { label: "H2", action: "heading2" },
  { label: "Bold", action: "bold" },
  { label: "List", action: "list" },
  { label: "Checklist", action: "checklist" }
];

export default function NotesWorkspace() {
  const workspaceState = useWorkspaceContext();
  const [notes, setNotes] = useState(seedNotes);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTag, setActiveTag] = useState("all");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoInput, setVideoInput] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [convertingFromNote, setConvertingFromNote] = useState(false);
  const [noteSummaries, setNoteSummaries] = useState({});
  const [summaryError, setSummaryError] = useState("");
  const [autosaveState, setAutosaveState] = useState("idle");
  const editorRef = useRef(null);
  const richEditorRef = useRef(null);
  const autosaveTimeoutRef = useRef(null);
  const lastPersistedRef = useRef({});
  const selectedNote =
    notes.find((note) => note.id === selectedId) ||
    notes[0] || {
      title: "",
      content: "",
      video_url: null,
      video_type: null,
      category: "idea",
      tags: [],
      pinned: false,
      editor_mode: "rich"
    };
  const canDelete = ["owner", "admin"].includes(
    String(workspaceState.membership?.role || "").toLowerCase()
  );

  const loadNotes = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      const params = new URLSearchParams();
      if (authUser?.email) {
        params.set("email", authUser.email);
      }
      const response = await fetch(
        params.toString() ? `/api/notes?${params.toString()}` : "/api/notes"
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load notes");
      }
      const fetched = data?.notes || [];
      const normalized = fetched.map(normalizeNote);
      lastPersistedRef.current = normalized.reduce((acc, note) => {
        acc[note.id] = serializeNote(note);
        return acc;
      }, {});
      setNotes(normalized);
      setSelectedId((prev) => {
        if (normalized.some((note) => note.id === prev)) return prev;
        return normalized[0]?.id || null;
      });
    } catch (err) {
      setError(err?.message || "Unable to load notes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    const workspaceId = workspaceState.workspace?.id;
    if (!workspaceId) return undefined;

    const notesChannel = supabase
      .channel(`notes-workspace-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => {
          loadNotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notesChannel);
    };
  }, [workspaceState.workspace?.id]);

  useEffect(() => {
    const fetchAttachments = async () => {
      if (!selectedId) {
        setAttachments([]);
        return;
      }

      setLoadingAttachments(true);
      try {
        const {
          data: { user: authUser }
        } = await supabase.auth.getUser();
        const params = new URLSearchParams();
        if (authUser?.email) {
          params.set("email", authUser.email);
        }
        const response = await fetch(
          params.toString()
            ? `/api/notes/${selectedId}/attachments?${params.toString()}`
            : `/api/notes/${selectedId}/attachments`
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load attachments");
        }
        setAttachments(data?.attachments || []);
      } catch (err) {
        setAttachments([]);
        setError(err?.message || "Unable to load attachments.");
      } finally {
        setLoadingAttachments(false);
      }
    };

    fetchAttachments();
  }, [selectedId]);

  useEffect(() => {
    setSummaryError("");
  }, [selectedId]);

  useEffect(() => {
    if (selectedNote?.video_type === "youtube") {
      setVideoInput(selectedNote.video_url || "");
    } else {
      setVideoInput("");
    }
  }, [selectedId, selectedNote?.video_url, selectedNote?.video_type]);

  useEffect(() => {
    if (selectedNote?.editor_mode !== "rich" || !richEditorRef.current) return;
    const nextHtml = getRichEditorContent(selectedNote?.content || "");
    if (richEditorRef.current.innerHTML !== nextHtml) {
      richEditorRef.current.innerHTML = nextHtml;
    }
  }, [selectedId, selectedNote?.content, selectedNote?.editor_mode]);

  useEffect(() => {
    if (!selectedNote?.id) return undefined;
    const serialized = serializeNote(selectedNote);
    if (lastPersistedRef.current[selectedNote.id] === serialized) {
      if (autosaveState !== "saving") {
        setAutosaveState("idle");
      }
      return undefined;
    }

    setAutosaveState("pending");
    clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      persistSelected(selectedNote, { silentError: true });
    }, 700);

    return () => {
      clearTimeout(autosaveTimeoutRef.current);
    };
  }, [
    selectedId,
    selectedNote?.title,
    selectedNote?.content,
    selectedNote?.video_url,
    selectedNote?.video_type,
    selectedNote?.category,
    selectedNote?.pinned,
    selectedNote?.editor_mode,
    JSON.stringify(selectedNote?.tags || [])
  ]);

  useEffect(
    () => () => {
      clearTimeout(autosaveTimeoutRef.current);
    },
    []
  );

  const persistSelected = async (noteOverride, options = {}) => {
    const current =
      noteOverride ||
      (selectedId ? notes.find((n) => n.id === selectedId) : null);
    if (!current?.id) return;
    try {
      setAutosaveState("saving");
      const response = await fetch(`/api/notes/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || "",
          title: current.title,
          content: current.content,
          video_url: current.video_url,
          video_type: current.video_type,
          category: current.category,
          tags: current.tags,
          pinned: current.pinned,
          editor_mode: current.editor_mode
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Save failed");
      }
      const savedNote = normalizeNote(data.note) || current;
      lastPersistedRef.current[current.id] = serializeNote(savedNote);
      setNotes((prev) =>
        prev.map((note) =>
          note.id === current.id ? savedNote : note
        )
      );
      setAutosaveState("saved");
    } catch (err) {
      setAutosaveState("error");
      if (!options.silentError) {
        setError(err?.message || "Save failed. Please retry.");
      }
    }
  };

  const createNote = () => {
    const run = async () => {
      try {
        setSuccess("");
        const nextCategory = activeCategory === "all" ? "idea" : activeCategory;
        const nextTags = activeTag === "all" ? [] : [activeTag];
        const nextPinned = showPinnedOnly;
        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: (await supabase.auth.getUser()).data.user?.email || "",
            title: "Untitled note",
            content: "",
            video_url: null,
            video_type: null,
            category: nextCategory,
            tags: nextTags,
            pinned: nextPinned,
            editor_mode: "rich"
          })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Could not create note");
        }
        const newNote = normalizeNote(data?.note);
        if (!newNote) return;
        lastPersistedRef.current[newNote.id] = serializeNote(newNote);
        setNotes((prev) => [newNote, ...prev]);
        setSelectedId(newNote.id);
        setError("");
      } catch (err) {
        setError(err?.message || "Could not create note.");
      }
    };
    run();
  };

  const availableTags = useMemo(
    () =>
      Array.from(new Set(notes.flatMap((note) => note.tags || []).filter(Boolean))).sort(),
    [notes]
  );

  const stats = useMemo(
    () => ({
      total: notes.length,
      pinned: notes.filter((note) => note.pinned).length,
      idea: notes.filter((note) => note.category === "idea").length,
      bug: notes.filter((note) => note.category === "bug").length,
      meeting: notes.filter((note) => note.category === "meeting").length,
      project: notes.filter((note) => note.category === "project").length
    }),
    [notes]
  );

  const filteredNotes = useMemo(() => {
    const q = search.toLowerCase();
    return notes.filter(
      (note) =>
        (note.title.toLowerCase().includes(q) ||
          note.content.toLowerCase().includes(q) ||
          (note.tags || []).some((tag) => tag.includes(q))) &&
        (activeCategory === "all" || note.category === activeCategory) &&
        (activeTag === "all" || (note.tags || []).includes(activeTag)) &&
        (!showPinnedOnly || note.pinned)
    );
  }, [notes, search, activeCategory, activeTag, showPinnedOnly]);

  const updateSelected = (field, value) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === selectedId ? { ...note, [field]: value } : note))
    );
  };

  const togglePin = () => {
    const nextNote = { ...selectedNote, pinned: !selectedNote?.pinned };
    updateSelected("pinned", nextNote.pinned);
    persistSelected(nextNote);
  };

  const addTag = () => {
    const clean = tagInput.replace(/^#/, "").trim().toLowerCase();
    if (!clean) return;
    const next = Array.from(new Set([...(selectedNote.tags || []), clean]));
    const nextNote = { ...selectedNote, tags: next };
    updateSelected("tags", next);
    setTagInput("");
    persistSelected(nextNote);
  };

  const removeTag = (tag) => {
    const nextTags = (selectedNote.tags || []).filter((item) => item !== tag);
    const nextNote = { ...selectedNote, tags: nextTags };
    updateSelected("tags", nextTags);
    persistSelected(nextNote);
  };

  const convertToTask = async () => {
    if (!selectedNote?.title?.trim()) {
      setError("Add a note title before converting it to a task.");
      return;
    }

    try {
      setCreatingTask(true);
      setError("");
      setSuccess("");
      const email = (await supabase.auth.getUser()).data.user?.email || "";
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          title: selectedNote.title.trim(),
          status: "todo"
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not convert note to task.");
      }
      setSuccess(`Task created from note: ${data?.task?.title || selectedNote.title}`);
    } catch (err) {
      setError(err?.message || "Could not convert note to task.");
    } finally {
      setCreatingTask(false);
    }
  };

  const convertNoteActionsToTasks = async () => {
    if (!selectedNote?.id) {
      setError("Select a note first.");
      return;
    }
    try {
      setConvertingFromNote(true);
      setError("");
      setSuccess("");
      const email = (await supabase.auth.getUser()).data.user?.email || "";
      const response = await fetch("/api/notes/to-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          note_id: selectedNote.id
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not extract action items.");
      }
      if (data?.tasks?.length) {
        const titles = data.tasks.map((t) => t.title).slice(0, 5).join(" · ");
        setSuccess(
          `Created ${data.tasks.length} task${data.tasks.length === 1 ? "" : "s"} from action items: ${titles}`
        );
      } else {
        setSuccess(data?.message || "No action items detected.");
      }
    } catch (err) {
      setError(err?.message || "Could not extract action items.");
    } finally {
      setConvertingFromNote(false);
    }
  };

  const summarizeNote = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const noteId = selectedNote?.id;
    const text = String(selectedNote?.content || "").trim();
    if (!text) {
      setSummaryError("Add note content before generating a summary.");
      setError("Add note content before generating a summary.");
      return;
    }

    try {
      setSummarizing(true);
      setError("");
      setSuccess("");
      setSummaryError("");
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "summarize",
          text
        })
      });
      const data = await response.json();
      const result = String(data?.result || "").trim();
      if (!response.ok) {
        throw new Error(result || "Could not summarize note.");
      }
      if (!result) {
        throw new Error("Summary returned empty content.");
      }

      setNoteSummaries((prev) => ({
        ...prev,
        [noteId]: result
      }));
      await fetch(`/api/notes/${noteId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || "",
          summary: result
        })
      }).catch(() => null);
      setSuccess("AI summary generated.");
    } catch (err) {
      const message = err?.message || "Could not summarize note.";
      setSummaryError(message);
      setError(message);
    } finally {
      setSummarizing(false);
    }
  };

  const setEditorMode = (mode) => {
    const nextNote = { ...selectedNote, editor_mode: mode };
    updateSelected("editor_mode", mode);
    persistSelected(nextNote);
  };

  const insertRichHtml = (html) => {
    if (typeof window === "undefined") return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      document.execCommand("insertHTML", false, html);
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const fragment = document.createDocumentFragment();
    let node = null;
    let lastNode = null;

    while ((node = wrapper.firstChild)) {
      lastNode = fragment.appendChild(node);
    }

    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const applyFormat = (action) => {
    if (selectedNote?.editor_mode === "rich") {
      applyRichFormat(action);
      return;
    }

    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = selectedNote.content || "";
    const selectedText = currentText.slice(start, end) || "text";
    let nextText = currentText;
    let nextCursorStart = start;
    let nextCursorEnd = end;

    if (action === "heading1") {
      nextText = `${currentText.slice(0, start)}# ${selectedText}${currentText.slice(end)}`;
      nextCursorEnd = start + selectedText.length + 2;
    }
    if (action === "heading2") {
      nextText = `${currentText.slice(0, start)}## ${selectedText}${currentText.slice(end)}`;
      nextCursorEnd = start + selectedText.length + 3;
    }
    if (action === "bold") {
      nextText = `${currentText.slice(0, start)}**${selectedText}**${currentText.slice(end)}`;
      nextCursorStart = start + 2;
      nextCursorEnd = start + selectedText.length + 2;
    }
    if (action === "list") {
      nextText = `${currentText.slice(0, start)}- ${selectedText}${currentText.slice(end)}`;
      nextCursorEnd = start + selectedText.length + 2;
    }
    if (action === "checklist") {
      nextText = `${currentText.slice(0, start)}- [ ] ${selectedText}${currentText.slice(end)}`;
      nextCursorEnd = start + selectedText.length + 6;
    }

    const nextNote = { ...selectedNote, content: nextText };
    updateSelected("content", nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursorStart, nextCursorEnd);
    }, 0);
    persistSelected(nextNote);
  };

  const applyRichFormat = (action) => {
    const editor = richEditorRef.current;
    if (!editor || typeof document === "undefined") return;

    editor.focus();

    if (action === "heading1") {
      document.execCommand("formatBlock", false, "h1");
    }
    if (action === "heading2") {
      document.execCommand("formatBlock", false, "h2");
    }
    if (action === "bold") {
      document.execCommand("bold", false);
    }
    if (action === "list") {
      document.execCommand("insertUnorderedList", false);
    }
    if (action === "checklist") {
      insertRichHtml(
        "<label style=\"display:flex;align-items:center;gap:8px;margin:6px 0;\"><input type=\"checkbox\" disabled><span>Checklist item</span></label>"
      );
    }

    const nextContent = editor.innerHTML;
    const nextNote = { ...selectedNote, content: nextContent };
    updateSelected("content", nextContent);
    persistSelected(nextNote);
  };

  const handleRichInput = (event) => {
    const nextContent = event.currentTarget.innerHTML;
    updateSelected("content", nextContent);
  };

  const handleAttachmentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedNote?.id) return;

    try {
      setUploadingAttachment(true);
      setError("");
      setSuccess("");
      const safeName = `${Date.now()}-${file.name}`;
      const path = `notes/${selectedNote.id}/${safeName}`;
      const upload = await supabase.storage.from("note-files").upload(path, file, {
        upsert: false
      });

      if (upload.error) {
        throw new Error(upload.error.message || "Attachment upload failed.");
      }

      const { data: publicData } = supabase.storage.from("note-files").getPublicUrl(path);
      const response = await fetch(`/api/notes/${selectedNote.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          file_type: file.type,
          file_url: publicData?.publicUrl || "",
          email: workspaceState.user?.email || ""
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Attachment metadata save failed.");
      }

      setAttachments((prev) => [data.attachment, ...prev]);
      setSuccess(`Attached file: ${file.name}`);
    } catch (err) {
      setError(
        err?.message ||
          "Could not attach file. Create the 'note-files' storage bucket in Supabase."
      );
    } finally {
      event.target.value = "";
      setUploadingAttachment(false);
    }
  };

  const handleYouTubeAttach = () => {
    if (!selectedNote?.id) {
      setError("Select or create a note first.");
      return;
    }
    const videoId = extractYouTubeId(videoInput);
    if (!videoId) {
      setError("Enter a valid YouTube link.");
      return;
    }

    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    const nextNote = { ...selectedNote, video_url: embedUrl, video_type: "youtube" };
    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedId ? { ...note, video_url: embedUrl, video_type: "youtube" } : note
      )
    );
    setVideoInput(embedUrl);
    setError("");
    setSuccess("YouTube video attached.");
    persistSelected(nextNote);
  };

  const handleVideoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedNote?.id) return;

    if (file.size > 50 * 1024 * 1024) {
      setError("Max upload size is 50MB.");
      event.target.value = "";
      return;
    }

    if (!/(mp4|webm)$/i.test(file.type) && !/(mp4|webm)$/i.test(file.name)) {
      setError("Only mp4 or webm files are allowed.");
      event.target.value = "";
      return;
    }

    try {
      setUploadingVideo(true);
      setError("");
      setSuccess("");

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be signed in to upload videos.");
      }

      const safeName = `${Date.now()}-${file.name}`;
      const path = `videos/${selectedNote.id}/${safeName}`;
      const upload = await supabase.storage.from("videos").upload(path, file, { upsert: false });

      if (upload.error) {
        throw new Error(upload.error.message || "Video upload failed.");
      }

      const { data: publicData } = supabase.storage.from("videos").getPublicUrl(path);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) {
        throw new Error("Could not get public URL for uploaded video.");
      }

      const nextNote = { ...selectedNote, video_url: publicUrl, video_type: "upload" };
      setNotes((prev) =>
        prev.map((note) =>
          note.id === selectedId ? { ...note, video_url: publicUrl, video_type: "upload" } : note
        )
      );
      setVideoInput("");
      await persistSelected(nextNote);
      setSuccess("Video uploaded and attached to note.");
    } catch (err) {
      setError(
        err?.message ||
          "Could not upload video. Ensure the 'videos' storage bucket exists and you are signed in."
      );
    } finally {
      event.target.value = "";
      setUploadingVideo(false);
    }
  };

  const clearVideo = () => {
    if (!selectedNote?.id) return;
    const nextNote = { ...selectedNote, video_url: null, video_type: null };
    setNotes((prev) =>
      prev.map((note) => (note.id === selectedId ? { ...note, video_url: null, video_type: null } : note))
    );
    setVideoInput("");
    setSuccess("Video removed from note.");
    setError("");
    persistSelected(nextNote);
  };

  const deleteSelectedNote = async () => {
    if (!selectedNote?.id) return;

    const confirmed = window.confirm(
      `Delete "${selectedNote.title || "Untitled note"}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingNote(true);
      setError("");
      setSuccess("");

      const currentIndex = notes.findIndex((note) => note.id === selectedNote.id);
      const response = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || ""
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not delete note.");
      }

      const remainingNotes = notes.filter((note) => note.id !== selectedNote.id);
      const nextNote =
        remainingNotes[currentIndex] ||
        remainingNotes[currentIndex - 1] ||
        remainingNotes[0] ||
        null;

      setNotes(remainingNotes);
      delete lastPersistedRef.current[selectedNote.id];
      setSelectedId(nextNote?.id || null);
      setAttachments([]);
      setSummaryError("");
      setSuccess("Note deleted.");
    } catch (err) {
      setError(err?.message || "Could not delete note.");
    } finally {
      setDeletingNote(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">My Notes</h3>
          <button type="button" onClick={createNote} className="rounded-lg bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white">
            + New
          </button>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pinned" value={stats.pinned} />
          <StatCard label="Ideas" value={stats.idea} />
          <StatCard label="Bugs" value={stats.bug} />
          <StatCard label="Meetings" value={stats.meeting} />
          <StatCard label="Projects" value={stats.project} />
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes..."
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
        />
        <div className="mb-3 grid gap-2">
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
          >
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {labelize(category)}
              </option>
            ))}
          </select>
          <select
            value={activeTag}
            onChange={(e) => setActiveTag(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
          >
            <option value="all">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowPinnedOnly((prev) => !prev)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              showPinnedOnly
                ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                : "border-slate-700 bg-slate-950 text-slate-300"
            }`}
          >
            {showPinnedOnly ? "Showing pinned only" : "Show pinned only"}
          </button>
        </div>
        <div className="space-y-2">
          {loading ? <p className="text-xs text-slate-400">Loading notes...</p> : null}
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          {success ? <p className="text-xs text-emerald-300">{success}</p> : null}
          {!loading && !error && filteredNotes.length === 0 ? (
            <p className="text-xs text-slate-400">No notes found for the current filters.</p>
          ) : null}
          {filteredNotes.map((note) => {
            const active = note.id === selectedId;
            return (
              <button
                type="button"
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-800 bg-slate-900 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{note.title}</p>
                  {note.pinned ? <span className="text-xs text-amber-300">PIN</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${categoryStyles[note.category] || categoryStyles.idea}`}
                  >
                    {labelize(note.category)}
                  </span>
                  {(note.tags || []).slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{stripContent(note.content)}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <SharedNoteBanner
          workspaceName={workspaceState.workspace?.name}
          role={workspaceState.membership?.role}
        />
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={selectedNote?.category || "idea"}
            onChange={(e) => updateSelected("category", e.target.value)}
            onBlur={persistSelected}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
          >
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {labelize(category)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={togglePin}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              selectedNote?.pinned
                ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                : "border-slate-700 bg-slate-950 text-slate-300"
            }`}
          >
            {selectedNote?.pinned ? "Pinned" : "Pin note"}
          </button>
          <button
            type="button"
            onClick={convertToTask}
            disabled={creatingTask}
            className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-60"
          >
            {creatingTask ? "Creating task..." : "Convert to task"}
          </button>
          <button
            type="button"
            onClick={convertNoteActionsToTasks}
            disabled={convertingFromNote}
            className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {convertingFromNote ? "Extracting..." : "AI action items → tasks"}
          </button>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={summarizeNote}
            disabled={summarizing}
            className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-sm text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-60"
          >
            {summarizing ? "Summarizing..." : "AI summary"}
          </button>
          <button
            type="button"
            onClick={() => setEditorMode(selectedNote?.editor_mode === "markdown" ? "rich" : "markdown")}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            {selectedNote?.editor_mode === "markdown" ? "Switch to Rich" : "Switch to Markdown"}
          </button>
          {canDelete ? (
            <button
              type="button"
              onClick={deleteSelectedNote}
              disabled={deletingNote || !selectedNote?.id}
              className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingNote ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
        <input
          value={selectedNote?.title || ""}
          onChange={(e) => updateSelected("title", e.target.value)}
          onBlur={persistSelected}
          placeholder="Note title"
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold text-white outline-none"
        />
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex flex-wrap gap-2">
            {(selectedNote.tags || []).map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => removeTag(tag)}
                className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
              >
                #{tag} x
              </button>
            ))}
            {!selectedNote.tags?.length ? (
              <p className="text-xs text-slate-500">No tags yet.</p>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add tag (dashboard, analytics)"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
            />
            <button
              type="button"
              onClick={addTag}
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
            >
              Add tag
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">Video</h4>
              <p className="text-xs text-slate-500">Attach a YouTube link or upload an mp4/webm (≤50MB).</p>
            </div>
            {selectedNote?.video_url ? (
              <button
                type="button"
                onClick={clearVideo}
                className="text-xs text-rose-300 underline-offset-2 hover:underline"
              >
                Remove video
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              placeholder="Paste YouTube link (watch or share URL)"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
            />
            <button
              type="button"
              onClick={handleYouTubeAttach}
              disabled={!videoInput.trim() || !selectedNote?.id}
              className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
            >
              Attach YouTube
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
              {uploadingVideo ? "Uploading video..." : "Upload video"}
              <input
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={handleVideoUpload}
                disabled={uploadingVideo || !selectedNote?.id}
              />
            </label>
            <p className="text-[11px] text-slate-500">Allowed: mp4, webm · Max 50MB · Auth required</p>
          </div>
          {selectedNote?.video_url ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              {renderVideoPlayer(selectedNote)}
            </div>
          ) : null}
        </div>

        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {editorTools.map((tool) => (
              <button
                type="button"
                key={tool.action}
                onClick={() => applyFormat(tool.action)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
              >
                {tool.label}
              </button>
            ))}
          </div>
          <textarea
            ref={editorRef}
            value={selectedNote?.editor_mode === "markdown" ? selectedNote?.content || "" : ""}
            onChange={(e) => updateSelected("content", e.target.value)}
            onBlur={persistSelected}
            placeholder="Write your note in markdown..."
            rows={16}
            className={`w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-200 outline-none ${
              selectedNote?.editor_mode === "markdown" ? "block" : "hidden"
            }`}
          />
          <div
            ref={richEditorRef}
            contentEditable={selectedNote?.editor_mode === "rich"}
            suppressContentEditableWarning
            onInput={handleRichInput}
            onBlur={persistSelected}
            dangerouslySetInnerHTML={{
              __html:
                selectedNote?.editor_mode === "rich"
                  ? getRichEditorContent(selectedNote?.content || "")
                  : ""
            }}
            className={`min-h-[24rem] rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-200 outline-none [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:ml-5 [&_ul]:list-disc [&_p]:mb-2 ${
              selectedNote?.editor_mode === "rich" ? "block" : "hidden"
            }`}
          />
        </div>

        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Preview</h4>
            <span className="text-xs text-slate-500">
              {selectedNote?.editor_mode === "markdown" ? "Markdown preview" : "Formatted preview"}
            </span>
          </div>
          <div
            className="prose prose-invert max-w-none text-sm text-slate-200"
            dangerouslySetInnerHTML={{
              __html:
                selectedNote?.editor_mode === "rich"
                  ? sanitizeRichHtml(selectedNote?.content || "")
                  : renderMarkdown(selectedNote?.content || "")
            }}
          />
          {selectedNote?.video_url && selectedNote?.video_type ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              {renderVideoPlayer(selectedNote)}
            </div>
          ) : null}
        </div>

        <div className="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">AI Summary</h4>
            <span className="text-xs text-slate-400">
              {summarizing ? "Generating..." : "Summary output"}
            </span>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Best for meeting notes, project updates, and rough note dumps.
          </p>
          {summaryError ? (
            <p className="text-xs text-rose-300">{summaryError}</p>
          ) : noteSummaries[selectedNote?.id] ? (
            <p className="text-sm leading-6 text-slate-200">
              {noteSummaries[selectedNote.id]}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Click <span className="font-semibold text-violet-200">AI summary</span> to generate a summary for this note.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">Attachments</h4>
              <p className="text-xs text-slate-500">
                Upload screenshots or files to this note.
                {attachments.length ? ` ${attachments.length} file${attachments.length === 1 ? "" : "s"} attached.` : ""}
              </p>
            </div>
            <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
              {uploadingAttachment ? "Uploading..." : "Attach file"}
              <input
                type="file"
                className="hidden"
                onChange={handleAttachmentUpload}
                disabled={uploadingAttachment || !selectedNote?.id}
              />
            </label>
          </div>
          {loadingAttachments ? <p className="text-xs text-slate-400">Loading attachments...</p> : null}
          {!loadingAttachments && attachments.length === 0 ? (
            <p className="text-xs text-slate-500">No attachments yet.</p>
          ) : null}
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-600 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="truncate font-medium">{attachment.file_name}</span>
                <span className="text-xs text-slate-500">{attachment.file_type || "file"}</span>
              </a>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Autosave is connected to Supabase.</p>
        <p className="mt-1 text-xs text-slate-400">
          {autosaveState === "saving"
            ? "Saving changes..."
            : autosaveState === "saved"
              ? "All changes saved."
              : autosaveState === "pending"
                ? "Changes pending autosave..."
                : autosaveState === "error"
                  ? "Autosave failed. Retry by clicking outside the editor."
                  : "Changes save automatically."}
        </p>
      </section>
    </div>
  );
}

function serializeNote(note) {
  return JSON.stringify({
    title: note?.title || "",
    content: note?.content || "",
    video_url: note?.video_url || null,
    video_type: note?.video_type || null,
    category: note?.category || "idea",
    tags: note?.tags || [],
    pinned: Boolean(note?.pinned),
    editor_mode: note?.editor_mode || "rich"
  });
}

function normalizeNote(note) {
  if (!note) return null;
  return {
    ...note,
    video_url: note.video_url || null,
    video_type: note.video_type || null,
    category: String(note.category || "idea").toLowerCase(),
    tags: Array.isArray(note.tags) ? note.tags : [],
    pinned: Boolean(note.pinned),
    editor_mode: String(note.editor_mode || "rich").toLowerCase()
  };
}

function labelize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/[#>*`_-]/g, "")
    .replace(/\[( |x)\]/gi, "")
    .trim();
}

function stripContent(value) {
  return stripMarkdown(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function renderMarkdown(input) {
  const escaped = escapeHtml(String(input || ""));
  const lines = escaped.split("\n");
  const html = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      html.push("<div class=\"h-3\"></div>");
      return;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      html.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
      return;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      html.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
      return;
    }

    if (trimmed.startsWith("- [ ] ") || trimmed.startsWith("- [x] ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      const checked = trimmed.startsWith("- [x] ");
      const text = trimmed.slice(6);
      html.push(`<li>${checked ? "☑" : "☐"} ${formatInline(text)}</li>`);
      return;
    }

    if (trimmed.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  });

  closeList();
  return html.join("");
}

function sanitizeRichHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function getRichEditorContent(value) {
  const content = String(value || "").trim();
  if (!content) return "<p></p>";

  if (/<[a-z][\s\S]*>/i.test(content)) {
    return sanitizeRichHtml(content);
  }

  return renderMarkdown(content);
}

function formatInline(value) {
  return value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractYouTubeId(url) {
  if (!url) return null;
  const value = String(url).trim();
  const patterns = [
    /youtu\.be\/([\w-]{6,})/i,
    /youtube\.com\/(?:watch\?v=|embed\/|v\/)([\w-]{6,})/i,
    /youtube\.com\/.+?[?&]v=([\w-]{6,})/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function renderVideoPlayer(note) {
  if (!note?.video_url || !note?.video_type) return null;
  if (note.video_type === "youtube") {
    return (
      <iframe
        title="YouTube video"
        src={note.video_url}
        className="h-[320px] w-full md:h-[400px]"
        allowFullScreen
      />
    );
  }

  if (note.video_type === "upload") {
    return (
      <video controls className="h-[320px] w-full md:h-[400px] bg-black" preload="metadata">
        <source src={note.video_url} type="video/mp4" />
        <source src={note.video_url} type="video/webm" />
        Your browser does not support the video tag.
      </video>
    );
  }

  return null;
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
