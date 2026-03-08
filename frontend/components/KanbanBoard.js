import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useWorkspaceContext } from "../lib/workspaceClient";
import AssigneeSelector from "./tasks/AssigneeSelector";
import TaskAssigneeBadge from "./tasks/TaskAssigneeBadge";
import TaskDueDateMeta from "./tasks/TaskDueDateMeta";

const initialBoard = {
  todo: [],
  in_progress: [],
  done: []
};

const columns = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" }
];
const columnIndex = columns.reduce((acc, column, index) => {
  acc[column.key] = index;
  return acc;
}, {});

const normalizeTaskStatus = (status) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "progress") return "in_progress";
  if (["todo", "in_progress", "done"].includes(value)) return value;
  return "todo";
};

const normalizeTask = (task) => ({
  ...task,
  status: normalizeTaskStatus(task?.status),
  due_date: normalizeDueDate(task?.due_date)
});

function normalizeDueDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isOverdueTask(task) {
  if (!task?.due_date || normalizeTaskStatus(task?.status) === "done") return false;
  const today = new Date();
  const nowKey = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    .toISOString()
    .slice(0, 10);
  return task.due_date < nowKey;
}

const mapTasksToBoard = (tasks = []) => ({
  todo: tasks.filter((t) => normalizeTaskStatus(t.status) === "todo").map(normalizeTask),
  in_progress: tasks
    .filter((t) => normalizeTaskStatus(t.status) === "in_progress")
    .map(normalizeTask),
  done: tasks.filter((t) => normalizeTaskStatus(t.status) === "done").map(normalizeTask)
});

export default function KanbanBoard() {
  const workspaceState = useWorkspaceContext();
  const [board, setBoard] = useState(initialBoard);
  const [newTask, setNewTask] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [movingTaskId, setMovingTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [editingAssignedTo, setEditingAssignedTo] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [dropTarget, setDropTarget] = useState("");
  const boardRef = useRef(initialBoard);

  const loadTasks = async () => {
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
        params.toString() ? `/api/tasks?${params.toString()}` : "/api/tasks"
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load tasks");
      }
      setBoard(mapTasksToBoard(data?.tasks || []));
    } catch (err) {
      setError(err?.message || "Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    const workspaceId = workspaceState.workspace?.id;
    if (!workspaceId) return undefined;

    const channel = supabase
      .channel(`tasks-workspace-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceState.workspace?.id]);

  const query = search.trim().toLowerCase();
  const visibleColumns = columns.filter(
    (column) => statusFilter === "all" || column.key === statusFilter
  );
  const visibleBoard = visibleColumns.reduce((acc, column) => {
    acc[column.key] = (board[column.key] || []).filter((task) =>
      String(task.title || "").toLowerCase().includes(query)
    );
    return acc;
  }, {});

  const moveTask = async ({ from, to, taskId }) => {
    const currentBoard = boardRef.current;
    const sourceItems = currentBoard[from] || [];
    const task = sourceItems.find((item) => item.id === taskId);
    if (!task) return;

    const previousBoard = currentBoard;
    const nextTask = { ...task, status: to };

    setMovingTaskId(taskId);
    setError("");
    setSuccess("");
    setBoard((prev) => ({
      ...prev,
      [from]: prev[from].filter((item) => item.id !== taskId),
      [to]: [...prev[to], nextTask]
    }));

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || "",
          status: to
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not update task status");
      }

      const savedTask = normalizeTask(data?.task || nextTask);
      setBoard((prev) => ({
        ...prev,
        [to]: prev[to].map((item) => (item.id === taskId ? savedTask : item))
      }));
      setSuccess(
        `Moved "${savedTask.title}" to ${
          columns.find((column) => column.key === to)?.label || to
        }.`
      );
    } catch (err) {
      setBoard(previousBoard);
      setError(err?.message || "Could not move task.");
    } finally {
      setMovingTaskId(null);
    }
  };

  const updateTaskDetails = async (taskId, updates) => {
    const trimmedTitle = String(updates?.title || "").trim();
    const nextDueDate = normalizeDueDate(updates?.due_date);
    const nextAssignedTo = updates?.assigned_to ? Number(updates.assigned_to) : null;
    if (!trimmedTitle) {
      setError("Task title is required.");
      return;
    }

    const currentBoard = boardRef.current;
    const task =
      currentBoard.todo.find((item) => item.id === taskId) ||
      currentBoard.in_progress.find((item) => item.id === taskId) ||
      currentBoard.done.find((item) => item.id === taskId);

    if (!task) return;

    const previousBoard = currentBoard;
    const nextTask = { ...task, title: trimmedTitle, due_date: nextDueDate, assigned_to: nextAssignedTo };

    setMovingTaskId(taskId);
    setError("");
    setSuccess("");
    setBoard((prev) => ({
      ...prev,
      [task.status]: prev[task.status].map((item) => (item.id === taskId ? nextTask : item))
    }));

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || "",
          title: trimmedTitle,
          due_date: nextDueDate,
          assigned_to: nextAssignedTo
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not update task details");
      }

      const savedTask = normalizeTask(data?.task || nextTask);
      setBoard((prev) => ({
        ...prev,
        [savedTask.status]: prev[savedTask.status].map((item) =>
          item.id === taskId ? savedTask : item
        )
      }));
      setEditingTaskId(null);
      setEditingTitle("");
      setEditingDueDate("");
      setEditingAssignedTo("");
      setSuccess(`Updated "${savedTask.title}".`);
    } catch (err) {
      setBoard(previousBoard);
      setError(err?.message || "Could not update task details.");
    } finally {
      setMovingTaskId(null);
    }
  };

  const deleteTask = async (task) => {
    const confirmed = window.confirm(`Delete "${task.title}"?`);
    if (!confirmed) return;

    const previousBoard = boardRef.current;
    setDeletingTaskId(task.id);
    setError("");
    setSuccess("");
    setBoard((prev) => ({
      ...prev,
      [task.status]: prev[task.status].filter((item) => item.id !== task.id)
    }));

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || ""
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not delete task");
      }

      if (editingTaskId === task.id) {
        setEditingTaskId(null);
        setEditingTitle("");
      }
      setSuccess(`Deleted "${task.title}".`);
    } catch (err) {
      setBoard(previousBoard);
      setError(err?.message || "Could not delete task.");
    } finally {
      setDeletingTaskId(null);
    }
  };

  const moveTaskByStep = (from, taskId, direction) => {
    const currentIndex = columnIndex[from];
    const nextIndex = currentIndex + direction;
    const destination = columns[nextIndex]?.key;
    if (!destination) return;
    moveTask({ from, to: destination, taskId });
  };

  const createTask = async () => {
    const title = newTask.trim();
    if (!title) return;

    try {
      setSuccess("");
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: workspaceState.user?.email || "",
          title,
          status: "todo",
          due_date: normalizeDueDate(newDueDate),
          assigned_to: newAssignedTo ? Number(newAssignedTo) : null
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not create task");
      }
      const task = normalizeTask(data?.task);
      if (!task) return;
      setBoard((prev) => ({ ...prev, todo: [...prev.todo, task] }));
      setNewTask("");
      setNewDueDate("");
      setNewAssignedTo("");
      setError("");
      setSuccess(`Added "${task.title}" to To Do.`);
    } catch (err) {
      setError(err?.message || "Could not create task.");
    }
  };

  const startEditingTask = (task) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setEditingDueDate(task.due_date || "");
    setEditingAssignedTo(task.assigned_to || "");
    setError("");
  };

  const onDragStart = (event, from, taskId) => {
    setDragState({ from, taskId });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
  };

  const onDragEnd = () => {
    setDragState(null);
    setDropTarget("");
  };

  const onDrop = (event, to) => {
    event.preventDefault();
    const taskId = Number(event.dataTransfer.getData("text/plain") || dragState?.taskId);
    const from = dragState?.from;
    setDragState(null);
    setDropTarget("");
    if (!from || !taskId || from === to) return;
    moveTask({ from, to, taskId });
  };

  const canDelete = ["owner", "admin"].includes(
    String(workspaceState.membership?.role || "").toLowerCase()
  );

  return (
    <div>
      <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_180px_220px_120px]">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              createTask();
            }
          }}
          placeholder="Add a new task..."
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
        />
        <input
          type="date"
          value={newDueDate}
          onChange={(event) => setNewDueDate(event.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
        />
        <AssigneeSelector
          members={workspaceState.members}
          value={newAssignedTo}
          onChange={setNewAssignedTo}
          disabled={workspaceState.loading}
        />
        <button
          type="button"
          onClick={createTask}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Add
        </button>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_220px]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tasks..."
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
        >
          <option value="all">All statuses</option>
          {columns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Workspace board with realtime updates, assignees, and due dates.
      </p>
      {loading ? <p className="mb-4 text-sm text-slate-400">Loading tasks...</p> : null}
      {success ? (
        <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}
      {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
      {!loading &&
      visibleColumns.every((column) => (visibleBoard[column.key] || []).length === 0) ? (
        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6 text-sm text-slate-400">
          No tasks match the current search and status filters.
        </div>
      ) : null}
      <div
        className={`grid gap-4 ${
          visibleColumns.length === 1
            ? "lg:grid-cols-1"
            : visibleColumns.length === 2
              ? "lg:grid-cols-2"
              : "lg:grid-cols-3"
        }`}
      >
        {visibleColumns.map((column) => (
          <section
            key={column.key}
            className={`rounded-2xl border p-4 transition ${
              dropTarget === column.key
                ? "border-indigo-400 bg-indigo-500/10"
                : "border-slate-800 bg-slate-900/70"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dropTarget !== column.key) {
                setDropTarget(column.key);
              }
            }}
            onDragLeave={() => {
              if (dropTarget === column.key) {
                setDropTarget("");
              }
            }}
            onDrop={(event) => onDrop(event, column.key)}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                {column.label}
              </h3>
              <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-400">
                {visibleBoard[column.key]?.length || 0}
              </span>
            </div>
            <div className="space-y-3">
              {!loading && (visibleBoard[column.key]?.length || 0) === 0 ? (
                <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-400">
                  {dragState && dropTarget === column.key
                    ? `Drop here to move a task to ${column.label}.`
                    : `No tasks in ${column.label.toLowerCase()}.`}
                </div>
              ) : null}
              {(visibleBoard[column.key] || []).map((task) => (
                <article
                  key={task.id}
                  draggable={editingTaskId !== task.id}
                  onDragStart={(event) => onDragStart(event, column.key, task.id)}
                  onDragEnd={onDragEnd}
                  className={`rounded-xl border px-3 py-3 text-sm text-slate-200 ${
                    isOverdueTask(task)
                      ? "border-rose-500/50 bg-rose-500/10"
                      : "border-slate-700 bg-slate-950"
                  }`}
                  aria-busy={movingTaskId === task.id}
                  style={{ opacity: dragState?.taskId === task.id ? 0.6 : 1 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {editingTaskId === task.id ? (
                        <div className="space-y-2">
                          <input
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none"
                            autoFocus
                          />
                          <input
                            type="date"
                            value={editingDueDate}
                            onChange={(event) => setEditingDueDate(event.target.value)}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none"
                          />
                          <AssigneeSelector
                            members={workspaceState.members}
                            value={editingAssignedTo}
                            onChange={setEditingAssignedTo}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateTaskDetails(task.id, {
                                  title: editingTitle,
                                  due_date: editingDueDate,
                                  assigned_to: editingAssignedTo
                                })
                              }
                              disabled={movingTaskId === task.id}
                              className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTaskId(null);
                                setEditingTitle("");
                                setEditingDueDate("");
                                setEditingAssignedTo("");
                              }}
                              disabled={movingTaskId === task.id}
                              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="block truncate">{task.title}</span>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <TaskDueDateMeta
                              dueDate={task.due_date}
                              overdue={isOverdueTask(task)}
                            />
                            <TaskAssigneeBadge assignee={task.assignee} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => moveTaskByStep(column.key, task.id, -1)}
                        disabled={
                          columnIndex[column.key] === 0 ||
                          movingTaskId === task.id ||
                          deletingTaskId === task.id ||
                          editingTaskId === task.id
                        }
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTaskByStep(column.key, task.id, 1)}
                        disabled={
                          columnIndex[column.key] === columns.length - 1 ||
                          movingTaskId === task.id ||
                          deletingTaskId === task.id ||
                          editingTaskId === task.id
                        }
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditingTask(task)}
                        disabled={movingTaskId === task.id || deletingTaskId === task.id}
                        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => deleteTask(task)}
                          disabled={movingTaskId === task.id || deletingTaskId === task.id}
                          className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-200 disabled:opacity-40"
                        >
                          {deletingTaskId === task.id ? "Deleting..." : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
