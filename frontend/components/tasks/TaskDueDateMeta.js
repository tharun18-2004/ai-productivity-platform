function formatDueDate(value) {
  if (!value) return "No due date";
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function TaskDueDateMeta({ dueDate, overdue = false }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 ${
        overdue
          ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
          : "border-slate-700 bg-slate-900 text-slate-400"
      }`}
    >
      {overdue ? `Overdue • ${formatDueDate(dueDate)}` : `Due • ${formatDueDate(dueDate)}`}
    </span>
  );
}
