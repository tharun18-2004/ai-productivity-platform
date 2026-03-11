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
  const [notesPhase, setNotesPhase] = useState("idle");
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
  const [editingVideo, setEditingVideo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [convertingFromNote, setConvertingFromNote] = useState(false);
  const [noteSummaries, setNoteSummaries] = useState({});
  const [summaryError, setSummaryError] = useState("");
  const [autosaveState, setAutosaveState] = useState("idle");
  const [videoPlayerMode, setVideoPlayerMode] = useState("idle");
  const editorRef = useRef(null);
  const autosaveTimeoutRef = useRef(null);
  const videoPlayerTimeoutRef = useRef(null);
  const notesRetryRef = useRef(false);
  const saveInFlightRef = useRef("");
  const lastSavedKeyRef = useRef("");
  const lastLocalSaveAtRef = useRef(0);
  const lastPersistedRef = useRef({});
  const selectedNote = notes.find((note) => note.id === selectedId) || notes[0] || null;
  const hasSelectedNote = Boolean(selectedNote?.id);
  const notesLoaded = notesPhase === "loaded";
  const canDelete = ["owner", "admin"].includes(
    String(workspaceState.membership?.role || "").toLowerCase()
  );
  const getRequestEmail = async () => {
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser();
    return authUser?.email || workspaceState.user?.email || "";
  };

  const fetchNotesOnce = async () => {
    const email = await getRequestEmail();
    if (!email) {
      throw new Error("Sign in to load workspace notes.");
    }
    const params = new URLSearchParams();
    params.set("email", email);
    const response = await fetch(
      params.toString() ? `/api/notes?${params.toString()}` : "/api/notes"
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Failed to load notes");
    }
    return (data?.notes || []).map(normalizeNote);
  };

  const loadNotes = async () => {
    if (!workspaceState?.ready) return;
    setNotesPhase("loading");
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const normalized = await fetchNotesOnce();
      notesRetryRef.current = false;
      lastPersistedRef.current = normalized.reduce((acc, note) => {
        acc[note.id] = serializeNote(note);
        return acc;
      }, {});
      lastSavedKeyRef.current = "";
      setNotes(normalized);
      setNotesPhase("loaded");
      setSelectedId((prev) => {
        if (normalized.some((note) => note.id === prev)) return prev;
        return normalized[0]?.id || null;
      });
    } catch (err) {
      const message = normalizeWorkspaceError(err?.message || "Unable to load notes.");
      const workspaceError = /session expired or workspace missing/i.test(message);
      if (workspaceError && !notesRetryRef.current && typeof workspaceState.refresh === "function") {
        notesRetryRef.current = true;
        await workspaceState.refresh();
        try {
          const normalized = await fetchNotesOnce();
          notesRetryRef.current = false;
          lastPersistedRef.current = normalized.reduce((acc, note) => {
            acc[note.id] = serializeNote(note);
            return acc;
          }, {});
          lastSavedKeyRef.current = "";
          setNotes(normalized);
          setNotesPhase("loaded");
          setSelectedId((prev) => {
            if (normalized.some((note) => note.id === prev)) return prev;
            return normalized[0]?.id || null;
          });
          return;
        } catch (retryErr) {
          setError(normalizeWorkspaceError(retryErr?.message || "Failed to load notes."));
          setNotesPhase("error");
          return;
        }
      }
      setError(message);
      setNotesPhase("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceState.ready) {
      loadNotes();
    }
  }, [workspaceState.ready, workspaceState.workspace?.id]);

  useEffect(() => {
    const workspaceId = workspaceState.workspace?.id;
    if (!workspaceId || !notesLoaded) return undefined;

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
          if (
            saveInFlightRef.current ||
            Date.now() - lastLocalSaveAtRef.current < 1500
          ) {
            return;
          }
          loadNotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notesChannel);
    };
  }, [workspaceState.workspace?.id, notesLoaded]);

  useEffect(() => {
    if (!workspaceState.ready || !notesLoaded) {
      setAttachments([]);
      return;
    }

    const fetchAttachments = async () => {
      if (!selectedId) {
        setAttachments([]);
        return;
      }

      setLoadingAttachments(true);
      try {
        const params = new URLSearchParams();
      const email = await getRequestEmail();
      if (email) {
        params.set("email", email);
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
        setError(normalizeWorkspaceError(err?.message || "Unable to load attachments."));
      } finally {
        setLoadingAttachments(false);
      }
    };

    fetchAttachments();
  }, [selectedId, workspaceState.ready, notesLoaded]);

  useEffect(() => {
    setSummaryError("");
  }, [selectedId]);

  useEffect(() => {
    setVideoInput("");
    setEditingVideo(!selectedNote?.video_url);
  }, [selectedId, selectedNote?.video_url]);

  useEffect(() => {
    clearTimeout(videoPlayerTimeoutRef.current);

    if (!selectedNote?.video_url || !selectedNote?.video_type) {
      setVideoPlayerMode("idle");
      return undefined;
    }

    if (selectedNote.video_type === "youtube") {
      setVideoPlayerMode("poster");
      return undefined;
    }

    setVideoPlayerMode("player");
    return () => {
      clearTimeout(videoPlayerTimeoutRef.current);
    };
  }, [selectedId, selectedNote?.video_url, selectedNote?.video_type]);

  useEffect(() => {
    clearTimeout(videoPlayerTimeoutRef.current);
    if (selectedNote?.video_type !== "youtube" || videoPlayerMode !== "player") {
      return undefined;
    }

    videoPlayerTimeoutRef.current = setTimeout(() => {
      setVideoPlayerMode((current) => (current === "player" ? "failed" : current));
    }, 5000);

    return () => {
      clearTimeout(videoPlayerTimeoutRef.current);
    };
  }, [selectedId, selectedNote?.video_type, videoPlayerMode]);

  useEffect(() => {
    if (!selectedNote?.id || !notesLoaded) return undefined;
    const serialized = serializeNote(selectedNote);
    const saveKey = `${selectedNote.id}:${serialized}`;
    if (
      lastPersistedRef.current[selectedNote.id] === serialized ||
      saveInFlightRef.current === saveKey ||
      lastSavedKeyRef.current === saveKey
    ) {
      if (
        autosaveState !== "saving" &&
        lastPersistedRef.current[selectedNote.id] === serialized
      ) {
        setAutosaveState((current) => (current === "saved" ? current : "idle"));
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
    notesLoaded,
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
      clearTimeout(videoPlayerTimeoutRef.current);
    },
    []
  );

  const persistSelected = async (noteOverride, options = {}) => {
    const current =
      noteOverride ||
      (selectedId ? notes.find((n) => n.id === selectedId) : null);
    if (!current?.id) return;
    const serialized = serializeNote(current);
    const saveKey = `${current.id}:${serialized}`;
    if (
      lastPersistedRef.current[current.id] === serialized ||
      saveInFlightRef.current === saveKey ||
      lastSavedKeyRef.current === saveKey
    ) {
      return;
    }
    try {
      saveInFlightRef.current = saveKey;
      lastLocalSaveAtRef.current = Date.now();
      setAutosaveState("saving");
      const response = await fetch(`/api/notes/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: await getRequestEmail(),
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
      const savedSerialized = serializeNote(savedNote);
      lastPersistedRef.current[current.id] = savedSerialized;
      lastSavedKeyRef.current = `${current.id}:${savedSerialized}`;
      lastLocalSaveAtRef.current = Date.now();
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
    } finally {
      if (saveInFlightRef.current === saveKey) {
        saveInFlightRef.current = "";
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
            email: await getRequestEmail(),
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
      const newNoteSerialized = serializeNote(newNote);
      lastPersistedRef.current[newNote.id] = newNoteSerialized;
      lastSavedKeyRef.current = `${newNote.id}:${newNoteSerialized}`;
      setNotesPhase("loaded");
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
    updateSelected("pinned", !selectedNote?.pinned);
  };

  const addTag = () => {
    const clean = tagInput.replace(/^#/, "").trim().toLowerCase();
    if (!clean) return;
    const next = Array.from(new Set([...(selectedNote.tags || []), clean]));
    updateSelected("tags", next);
    setTagInput("");
  };

  const removeTag = (tag) => {
    const nextTags = (selectedNote.tags || []).filter((item) => item !== tag);
    updateSelected("tags", nextTags);
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
      const email = await getRequestEmail();
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
      const email = await getRequestEmail();
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
          email: await getRequestEmail(),
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

  const applyFormat = (action) => {
    const textarea = editorRef.current;
    if (!textarea || !selectedNote) return;

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

    updateSelected("content", nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursorStart, nextCursorEnd);
    }, 0);
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
          email: await getRequestEmail()
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

    const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedId
          ? { ...note, video_url: embedUrl, video_type: "youtube", video_summary: null }
          : note
      )
    );
    setVideoPlayerMode("poster");
    setVideoInput("");
    setEditingVideo(false);
    setError("");
    setSuccess("YouTube video attached.");
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

      setNotes((prev) =>
        prev.map((note) =>
          note.id === selectedId
            ? { ...note, video_url: publicUrl, video_type: "upload", video_summary: null }
            : note
        )
      );
      setVideoPlayerMode("player");
      setVideoInput("");
      setEditingVideo(false);
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
    setNotes((prev) =>
      prev.map((note) => (note.id === selectedId ? { ...note, video_url: null, video_type: null } : note))
    );
    setVideoPlayerMode("idle");
    setVideoInput("");
    setEditingVideo(true);
    setSuccess("Video removed from note.");
    setError("");
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
          email: await getRequestEmail()
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
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-[#1a2233] bg-[#0b111a] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Workspace Notes</p>
            <h3 className="mt-1 text-lg font-semibold text-white">My Notes</h3>
          </div>
          <button type="button" onClick={createNote} className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)]">
            + New
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2">
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
          className="mb-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none"
        />
        <div className="mb-3 grid gap-2">
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none"
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
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none"
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
            className={`rounded-2xl border px-3 py-2.5 text-sm transition ${
              showPinnedOnly
                ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                : "border-slate-700 bg-slate-950 text-slate-300"
            }`}
          >
            {showPinnedOnly ? "Showing pinned only" : "Show pinned only"}
          </button>
        </div>
        <div className="space-y-3">
          {notesPhase === "loading" ? <p className="text-xs text-slate-400">Loading notes...</p> : null}
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          {success ? <p className="text-xs text-emerald-300">{success}</p> : null}
          {notesPhase === "loaded" && notes.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-4 text-sm text-slate-400">
              <p>No notes in this workspace yet.</p>
              <button
                type="button"
                onClick={createNote}
                className="mt-3 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white"
              >
                Create your first note
              </button>
            </div>
          ) : null}
          {notesPhase === "loaded" && notes.length > 0 && !error && filteredNotes.length === 0 ? (
            <p className="text-xs text-slate-400">No notes found for the current filters.</p>
          ) : null}
          {filteredNotes.map((note) => {
            const active = note.id === selectedId;
            return (
              <button
                type="button"
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.15)] transition ${
                  active
                    ? "border-indigo-400/50 bg-indigo-500/12 ring-1 ring-indigo-400/20"
                    : "border-slate-800 bg-[#0a1018] hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{note.title}</p>
                  {note.pinned ? (
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      Pin
                    </span>
                  ) : null}
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
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{stripContent(note.content)}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="rounded-[28px] border border-[#1a2233] bg-[#0b111a] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <SharedNoteBanner
          workspaceName={workspaceState.workspace?.name}
          role={workspaceState.membership?.role}
        />
        {notesPhase === "loading" && !hasSelectedNote ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-sm text-slate-400">
            Loading notes...
          </div>
        ) : null}
        {notesPhase === "loaded" && !hasSelectedNote ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-sm text-slate-400">
            Select a note from the list or create a new one to start writing.
          </div>
        ) : null}
        {hasSelectedNote ? (
          <>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
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
          placeholder="Note title"
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold text-white outline-none"
        />
        <div className="mb-3 rounded-[24px] border border-slate-800 bg-[#0a1018] p-4">
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

        <div className="overflow-hidden rounded-[30px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(19,27,41,0.98),rgba(6,10,18,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
          <div className="border-b border-slate-800/90 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">Video Learning</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h4 className="text-xl font-semibold text-white">Attached Video</h4>
                {selectedNote?.video_url ? (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                    Ready to watch
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">Attach a YouTube link or upload an mp4/webm (max 50MB).</p>
            </div>
            {selectedNote?.video_url ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingVideo((current) => !current)}
                  className="rounded-2xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-900"
                >
                  {editingVideo ? "Cancel" : "Change Video"}
                </button>
                <button
                  type="button"
                  onClick={clearVideo}
                  className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                >
                  Remove Video
                </button>
              </div>
            ) : null}
          </div>
          {!selectedNote?.video_url || editingVideo ? (
            <div className="mt-5 rounded-[24px] border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  placeholder="Paste YouTube link (watch, share, or shorts URL)"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm text-slate-200 outline-none"
                />
                <button
                  type="button"
                  onClick={handleYouTubeAttach}
                  disabled={!videoInput.trim() || !selectedNote?.id}
                  className="rounded-2xl bg-red-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
                >
                  Attach YouTube
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-2xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-slate-200">
                  {uploadingVideo ? "Uploading video..." : "Upload video"}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    onChange={handleVideoUpload}
                    disabled={uploadingVideo || !selectedNote?.id}
                  />
                </label>
                <p className="text-[11px] text-slate-500">Allowed: mp4, webm, max 50MB, auth required</p>
              </div>
            </div>
          ) : null}
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-6">
            {selectedNote?.video_url ? (
              <div className="rounded-[28px] border border-slate-700/80 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),rgba(3,7,18,0)_42%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,1))] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:p-4">
                <div className="mb-3 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Now Playing</p>
                  <p className="mt-1 text-sm font-medium text-slate-200">Learn while you write without leaving the workspace</p>
                </div>
                {videoPlayerMode === "failed" ? (
                  <div className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-5 py-6 text-left">
                    <p className="text-sm font-semibold text-amber-100">Video is attached but preview could not load here.</p>
                    <p className="mt-2 text-xs leading-6 text-amber-50/70">
                      The link is saved to this note. Open it in YouTube or replace it if the embed is blocked.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={toExternalVideoUrl(selectedNote)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/20"
                      >
                        Open in YouTube
                      </a>
                      <button
                        type="button"
                        onClick={() => setEditingVideo(true)}
                        className="rounded-2xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500"
                      >
                        Change Video
                      </button>
                      <button
                        type="button"
                        onClick={clearVideo}
                        className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                      >
                        Remove Video
                      </button>
                    </div>
                  </div>
                ) : selectedNote?.video_type === "youtube" && videoPlayerMode !== "player" ? (
                  <button
                    type="button"
                    onClick={() => setVideoPlayerMode("player")}
                    className="group relative block w-full overflow-hidden rounded-[24px] border border-slate-700/80 bg-slate-950 text-left ring-1 ring-white/5 transition hover:border-slate-500"
                  >
                    <div className="relative w-full bg-slate-950 pt-[56.25%]">
                      {getYouTubeThumbnailUrl(selectedNote) ? (
                        <img
                          src={getYouTubeThumbnailUrl(selectedNote)}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                          onError={(event) => {
                            const fallback = getYouTubeFallbackThumbnailUrl(selectedNote);
                            if (fallback && event.currentTarget.src !== fallback) {
                              event.currentTarget.src = fallback;
                              return;
                            }
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.72))]" />
                      <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                        YouTube
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white shadow-[0_18px_36px_rgba(0,0,0,0.35)] transition group-hover:scale-105">
                          <span className="ml-1 text-2xl">Play</span>
                        </div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.88))] px-5 py-4">
                        <p className="text-sm font-semibold text-white">Load video preview</p>
                        <p className="mt-1 text-xs text-slate-300">
                          Click to play the YouTube video inside this note.
                        </p>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="overflow-hidden rounded-[24px] border border-slate-700/80 bg-black ring-1 ring-white/5">
                    {renderVideoPlayer(selectedNote, {
                      autoplay: selectedNote?.video_type === "youtube" && videoPlayerMode === "player",
                      onLoad: () => clearTimeout(videoPlayerTimeoutRef.current),
                      onError: () => setVideoPlayerMode("failed")
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-700 bg-[linear-gradient(180deg,rgba(10,16,24,0.92),rgba(5,10,16,0.98))] px-6 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/90 text-sm font-semibold text-slate-300">
                  ▶
                </div>
                <p className="mt-4 text-base font-semibold text-slate-100">No video attached yet</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Attach a tutorial, meeting recording, or product demo so your notes and media stay in one focused workspace.
                </p>
              </div>
            )}
          </div>
          <div className="border-t border-slate-800/90 px-5 py-3 sm:px-6">
            <p className="text-xs text-slate-500">
              Advanced timestamp notes and AI video summary are disabled for stability.
            </p>
          </div>
        </div>

        <div className="mb-3 rounded-[24px] border border-slate-800 bg-[#0a1018] p-4">
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
            value={selectedNote?.content || ""}
            onChange={(e) => updateSelected("content", e.target.value)}
            placeholder="Write your note in markdown..."
            rows={16}
            className="w-full resize-none rounded-2xl border border-slate-700 bg-[#07101a] px-4 py-4 text-sm leading-7 text-slate-200 outline-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-400">
            Autosave
          </span>
          <p
            className={`text-xs ${
              autosaveState === "saved"
                ? "text-emerald-300"
                : autosaveState === "saving" || autosaveState === "pending"
                  ? "text-amber-300"
                  : autosaveState === "error"
                    ? "text-rose-300"
                    : "text-slate-400"
            }`}
          >
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
        </div>
          </div>
          <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-800 bg-[#0a1018] p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Preview</h4>
            <span className="text-xs text-slate-500">Formatted preview</span>
          </div>
          <div
            className="prose prose-invert max-w-none text-sm text-slate-200"
            dangerouslySetInnerHTML={{
              __html: renderNotePreview(selectedNote?.content || "")
            }}
          />
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

        <div className="rounded-[24px] border border-slate-800 bg-[#0a1018] p-4">
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
          </div>
        </div>
          </>
        ) : null}
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
    video_summary: note.video_summary || null,
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

function renderNotePreview(value) {
  const content = String(value || "").trim();
  if (!content) return "<p></p>";
  return /<[a-z][\s\S]*>/i.test(content) ? sanitizeRichHtml(content) : renderMarkdown(content);
}

function normalizeWorkspaceError(message) {
  const text = String(message || "").trim();
  if (/workspace not found/i.test(text)) {
    return "Session expired or workspace missing. Refresh or sign in again.";
  }
  return text || "Something went wrong.";
}

function extractYouTubeId(url) {
  if (!url) return null;
  const value = String(url).trim();
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.searchParams.get("v")) {
        return parsed.searchParams.get("v");
      }
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "v") {
        return segments[1] || null;
      }
    }
  } catch {
    // Fall back to regex parsing for partial or malformed URLs.
  }
  const patterns = [
    /youtu\.be\/([\w-]{6,})/i,
    /youtube\.com\/(?:watch\?v=|embed\/|v\/)([\w-]{6,})/i,
    /youtube\.com\/.+?[?&]v=([\w-]{6,})/i,
    /youtube\.com\/shorts\/([\w-]{6,})/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function renderVideoPlayer(note, handlers = {}) {
  if (!note?.video_url || !note?.video_type) return null;
  const { autoplay = false, onLoad, onError } = handlers;
  if (note.video_type === "youtube") {
    return (
      <div className="relative w-full overflow-hidden rounded-[24px] bg-black pt-[56.25%]">
        <iframe
          title="YouTube video"
          src={toPlayableEmbedUrl(note.video_url, autoplay)}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onLoad}
          onError={onError}
          allowFullScreen
        />
      </div>
    );
  }

  if (note.video_type === "upload") {
    return (
      <div className="relative w-full overflow-hidden rounded-[24px] bg-black pt-[56.25%]">
        <video
          controls
          className="absolute inset-0 h-full w-full bg-black object-cover"
          preload="metadata"
          onLoadedData={onLoad}
          onError={onError}
        >
          <source src={note.video_url} type="video/mp4" />
          <source src={note.video_url} type="video/webm" />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  return null;
}

function toExternalVideoUrl(note) {
  const value = String(note?.video_url || "");
  if (!value) return "#";

  const embedMatch = value.match(/youtube\.com\/embed\/([\w-]{6,})/i);
  if (embedMatch?.[1]) {
    return `https://www.youtube.com/watch?v=${embedMatch[1]}`;
  }

  return value;
}

function toPlayableEmbedUrl(value, autoplay = false) {
  const source = String(value || "");
  if (!source) return source;

  try {
    const parsed = new URL(source);
    if (autoplay) {
      parsed.searchParams.set("autoplay", "1");
      parsed.searchParams.set("rel", "0");
    }
    return parsed.toString();
  } catch {
    return autoplay
      ? `${source}${source.includes("?") ? "&" : "?"}autoplay=1&rel=0`
      : source;
  }
}

function getYouTubeThumbnailUrl(note) {
  const directId = extractYouTubeId(note?.video_url || "");
  if (directId) {
    return `https://img.youtube.com/vi/${directId}/maxresdefault.jpg`;
  }

  const value = String(note?.video_url || "");
  const embedMatch = value.match(/youtube\.com\/embed\/([\w-]{6,})/i);
  if (embedMatch?.[1]) {
    return `https://img.youtube.com/vi/${embedMatch[1]}/maxresdefault.jpg`;
  }

  return "";
}

function getYouTubeFallbackThumbnailUrl(note) {
  const directId = extractYouTubeId(note?.video_url || "");
  if (directId) {
    return `https://img.youtube.com/vi/${directId}/hqdefault.jpg`;
  }

  const value = String(note?.video_url || "");
  const embedMatch = value.match(/youtube\.com\/embed\/([\w-]{6,})/i);
  if (embedMatch?.[1]) {
    return `https://img.youtube.com/vi/${embedMatch[1]}/hqdefault.jpg`;
  }

  return "";
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
