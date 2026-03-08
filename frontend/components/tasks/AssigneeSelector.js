export default function AssigneeSelector({
  members = [],
  value = "",
  onChange,
  theme = "dark",
  disabled = false
}) {
  return (
    <select
      value={value || ""}
      onChange={(event) => onChange?.(event.target.value)}
      disabled={disabled}
      className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none disabled:opacity-50 ${
        theme === "light"
          ? "border-slate-300 bg-white text-slate-900"
          : "border-slate-700 bg-slate-900 text-slate-100"
      }`}
    >
      <option value="">Unassigned</option>
      {members
        .filter((member) => member.status === "active" && member.user_id)
        .map((member) => (
          <option key={member.id} value={member.user_id}>
            {member.profile?.name || member.invited_email}
          </option>
        ))}
    </select>
  );
}
