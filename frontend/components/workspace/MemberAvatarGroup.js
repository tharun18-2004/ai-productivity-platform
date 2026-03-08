function initialsForMember(member) {
  const name =
    member?.profile?.name ||
    member?.display_name ||
    member?.invited_email ||
    "Member";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function MemberAvatarGroup({ members = [], theme = "dark" }) {
  const visibleMembers = members.slice(0, 4);
  const overflow = Math.max(0, members.length - visibleMembers.length);

  return (
    <div className="flex items-center">
      {visibleMembers.map((member, index) => (
        <div
          key={member.id || member.invited_email || index}
          title={member?.profile?.name || member?.invited_email || "Member"}
          className={`-ml-2 flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-semibold first:ml-0 ${
            theme === "light"
              ? "border-slate-200 bg-sky-50 text-slate-700"
              : "border-slate-800 bg-slate-900 text-slate-200"
          }`}
        >
          {initialsForMember(member)}
        </div>
      ))}
      {overflow ? (
        <div
          className={`-ml-2 flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-semibold ${
            theme === "light"
              ? "border-slate-200 bg-white text-slate-600"
              : "border-slate-800 bg-slate-950 text-slate-300"
          }`}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
