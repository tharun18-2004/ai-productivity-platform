export default function TaskAssigneeBadge({ assignee }) {
  if (!assignee) {
    return (
      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
        Unassigned
      </span>
    );
  }

  return (
    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">
      {assignee?.profile?.name || assignee?.invited_email || "Member"}
    </span>
  );
}
