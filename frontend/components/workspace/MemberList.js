const roleRank = {
  owner: 0,
  admin: 1,
  member: 2
};

const roleBadgeStyles = {
  owner: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  admin: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  member: "border-slate-600 bg-slate-950 text-slate-300"
};

const statusBadgeStyles = {
  active: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  pending: "border-violet-400/30 bg-violet-500/10 text-violet-200"
};
const ROW_ACTION_BASE_CLASS =
  "rounded-lg border px-2 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50";
const ROLE_SELECT_CLASS = `${ROW_ACTION_BASE_CLASS} min-w-[96px] border-slate-700 bg-slate-950 text-slate-200 focus-visible:ring-cyan-400/70`;
const COPY_BUTTON_CLASS = `${ROW_ACTION_BASE_CLASS} border-slate-700 text-slate-300 hover:bg-slate-950 focus-visible:ring-cyan-400/70`;
const RESEND_BUTTON_CLASS = `${ROW_ACTION_BASE_CLASS} border-violet-500/40 text-violet-200 hover:bg-violet-500/10 focus-visible:ring-violet-400/70`;
const REMOVE_BUTTON_CLASS = `${ROW_ACTION_BASE_CLASS} border-rose-500/40 text-rose-200 hover:bg-rose-500/10 focus-visible:ring-rose-400/70`;

function memberName(member) {
  return member.profile?.name || member.invited_email || "Member";
}

function memberEmail(member) {
  return member.invited_email || member.profile?.email || "";
}

function memberInitials(member) {
  return memberName(member)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatMemberTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function sortMembers(members = []) {
  return [...members].sort((a, b) => {
    const roleDiff = (roleRank[a.role] ?? 99) - (roleRank[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return memberName(a).localeCompare(memberName(b));
  });
}

function Badge({ label, className }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

function MemberRow({
  member,
  canManage,
  onRemove,
  onRoleChange,
  onCopyEmail,
  onResendInvite,
  removingMemberId,
  updatingRoleMemberId,
  resendingMemberId
}) {
  const name = memberName(member);
  const email = memberEmail(member);
  const removable = canManage && member.role !== "owner";
  const roleEditable = canManage && member.role !== "owner";
  const canResend = canManage && member.status === "pending" && email;
  const timestampLabel =
    member.status === "active"
      ? `Joined ${formatMemberTimestamp(member.joined_at || member.created_at)}`
      : `Invited ${formatMemberTimestamp(member.created_at)}`;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-xs font-semibold text-slate-200">
            {memberInitials(member)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate">{name}</p>
            {email ? <p className="truncate text-xs text-slate-500">{email}</p> : null}
            {timestampLabel ? (
              <p className="mt-0.5 text-[11px] text-slate-500">{timestampLabel}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge
                label={member.role}
                className={roleBadgeStyles[member.role] || roleBadgeStyles.member}
              />
              <Badge
                label={member.status}
                className={statusBadgeStyles[member.status] || statusBadgeStyles.pending}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          {roleEditable ? (
            <select
              value={member.role}
              onChange={(event) => onRoleChange?.(member, event.target.value)}
              disabled={updatingRoleMemberId === member.id}
              className={ROLE_SELECT_CLASS}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          ) : null}
          {email ? (
            <button
              type="button"
              onClick={() => onCopyEmail?.(member)}
              className={COPY_BUTTON_CLASS}
            >
              Copy email
            </button>
          ) : null}
          {canResend ? (
            <button
              type="button"
              onClick={() => onResendInvite?.(member)}
              disabled={resendingMemberId === member.id}
              className={RESEND_BUTTON_CLASS}
            >
              {resendingMemberId === member.id ? "Resending..." : "Resend"}
            </button>
          ) : null}
          {removable ? (
            <button
              type="button"
              onClick={() => onRemove?.(member)}
              disabled={removingMemberId === member.id}
              className={REMOVE_BUTTON_CLASS}
            >
              {removingMemberId === member.id ? "Removing..." : "Remove"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MemberSection({
  title,
  members,
  emptyLabel,
  canManage,
  onRemove,
  onRoleChange,
  onCopyEmail,
  onResendInvite,
  removingMemberId,
  updatingRoleMemberId,
  resendingMemberId
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
        <span className="text-[11px] text-slate-500">
          {members.length} {members.length === 1 ? "person" : "people"}
        </span>
      </div>
      {members.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-slate-500">
          {emptyLabel}
        </div>
      ) : null}
      {members.map((member) => (
        <MemberRow
          key={member.id || member.invited_email}
          member={member}
          canManage={canManage}
          onRemove={onRemove}
          onRoleChange={onRoleChange}
          onCopyEmail={onCopyEmail}
          onResendInvite={onResendInvite}
          removingMemberId={removingMemberId}
          updatingRoleMemberId={updatingRoleMemberId}
          resendingMemberId={resendingMemberId}
        />
      ))}
    </section>
  );
}

export default function MemberList({
  members = [],
  canManage = false,
  onRemove,
  onRoleChange,
  onCopyEmail,
  onResendInvite,
  removingMemberId = null,
  updatingRoleMemberId = null,
  resendingMemberId = null
}) {
  const activeMembers = sortMembers(members.filter((member) => member.status === "active"));
  const pendingMembers = sortMembers(members.filter((member) => member.status !== "active"));

  return (
    <div className="mt-4 space-y-4">
      <MemberSection
        title="Active Members"
        members={activeMembers}
        emptyLabel="No active members found."
        canManage={canManage}
        onRemove={onRemove}
        onRoleChange={onRoleChange}
        onCopyEmail={onCopyEmail}
        onResendInvite={onResendInvite}
        removingMemberId={removingMemberId}
        updatingRoleMemberId={updatingRoleMemberId}
        resendingMemberId={resendingMemberId}
      />
      <MemberSection
        title="Pending Invites"
        members={pendingMembers}
        emptyLabel="No pending invites found."
        canManage={canManage}
        onRemove={onRemove}
        onRoleChange={onRoleChange}
        onCopyEmail={onCopyEmail}
        onResendInvite={onResendInvite}
        removingMemberId={removingMemberId}
        updatingRoleMemberId={updatingRoleMemberId}
        resendingMemberId={resendingMemberId}
      />
    </div>
  );
}
