import { useEffect, useRef, useState } from "react";
import MemberList from "./MemberList";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PANEL_THEME_STYLES = {
  light: {
    shell: "border-slate-300 bg-white",
    title: "text-lg font-semibold text-slate-900",
    body: "text-sm text-slate-500",
    field: "border-slate-300 bg-slate-50 text-slate-900"
  },
  dark: {
    shell: "border-slate-800 bg-slate-950",
    title: "text-lg font-semibold text-white",
    body: "text-sm text-slate-400",
    field: "border-slate-700 bg-slate-900 text-slate-100"
  }
};
const MODAL_ICON_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-lg text-slate-300 transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70";
const MODAL_TEXT_BUTTON_CLASS =
  "hidden rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 sm:inline-flex";
const PANEL_FIELD_BASE_CLASS = "w-full rounded-xl border px-3 py-2 text-sm outline-none";

export default function InviteMemberPanel({
  open,
  onClose,
  onInvite,
  onRemove,
  onRoleChange,
  onCopyEmail,
  onResendInvite,
  members = [],
  canManage = false,
  removingMemberId = null,
  updatingRoleMemberId = null,
  resendingMemberId = null,
  theme = "dark"
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const dialogRef = useRef(null);
  const emailInputRef = useRef(null);
  const panelTheme = PANEL_THEME_STYLES[theme] || PANEL_THEME_STYLES.dark;

  const filteredMembers = members.filter((member) => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return true;

    const name = String(member?.profile?.name || "").toLowerCase();
    const emailValue = String(member?.invited_email || member?.profile?.email || "").toLowerCase();
    const roleText = String(member?.role || "").toLowerCase();
    const statusText = String(member?.status || "").toLowerCase();

    return [name, emailValue, roleText, statusText].some((value) => value.includes(query));
  });

  useEffect(() => {
    if (!open) return undefined;

    const timer = setTimeout(() => {
      emailInputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((element) => !element.hasAttribute("disabled"));

      if (!focusableElements.length) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
      onClick={() => onClose?.()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-member-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col rounded-3xl border p-4 sm:max-h-[calc(100vh-3rem)] sm:p-5 ${panelTheme.shell}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="workspace-member-dialog-title" className={panelTheme.title}>
              Invite Member
            </h3>
            <p className={panelTheme.body}>
              Add a teammate to this workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close member dialog"
              className={MODAL_ICON_BUTTON_CLASS}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6L18 18" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className={MODAL_TEXT_BUTTON_CLASS}
            >
              Close
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <input
            ref={emailInputRef}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
            className={`${PANEL_FIELD_BASE_CLASS} ${panelTheme.field}`}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className={`${PANEL_FIELD_BASE_CLASS} ${panelTheme.field}`}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              try {
                setLoading(true);
                setError("");
                setSuccess("");
                await onInvite({ invited_email: email, role });
                setEmail("");
                setRole("member");
                setSuccess("Invite sent successfully.");
              } catch (err) {
                setError(err?.message || "Could not send invite.");
              } finally {
                setLoading(false);
              }
            }}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Invite"}
          </button>
        </div>
        {success ? (
          <p className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {success}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        <div className="mt-4">
          <input
            type="text"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="Search members by name, email, role, or status"
            className={`${PANEL_FIELD_BASE_CLASS} ${panelTheme.field}`}
          />
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <MemberList
            members={filteredMembers}
            canManage={canManage}
            onRemove={async (member) => {
              try {
                setError("");
                setSuccess("");
                await onRemove?.(member);
                setSuccess(
                  `Removed ${member?.profile?.name || member?.invited_email || "member"}.`
                );
              } catch (err) {
                setError(err?.message || "Could not remove member.");
              }
            }}
            onRoleChange={async (member, nextRole) => {
              try {
                setError("");
                setSuccess("");
                await onRoleChange?.(member, nextRole);
                setSuccess(
                  `${member?.profile?.name || member?.invited_email || "Member"} is now ${nextRole}.`
                );
              } catch (err) {
                setError(err?.message || "Could not update member role.");
              }
            }}
            onCopyEmail={async (member) => {
              try {
                setError("");
                setSuccess("");
                await onCopyEmail?.(member);
                setSuccess(
                  `Copied ${member?.invited_email || member?.profile?.email || "email"}.`
                );
              } catch (err) {
                setError(err?.message || "Could not copy email.");
              }
            }}
            onResendInvite={async (member) => {
              try {
                setError("");
                setSuccess("");
                await onResendInvite?.(member);
                setSuccess(
                  `Resent invite to ${member?.invited_email || member?.profile?.email || "member"}.`
                );
              } catch (err) {
                setError(err?.message || "Could not resend invite.");
              }
            }}
            removingMemberId={removingMemberId}
            updatingRoleMemberId={updatingRoleMemberId}
            resendingMemberId={resendingMemberId}
          />
        </div>
      </div>
    </div>
  );
}
