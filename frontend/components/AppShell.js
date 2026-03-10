import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useWorkspaceContext } from "../lib/workspaceClient";
import WorkspaceSwitcher from "./workspace/WorkspaceSwitcher";
import MemberAvatarGroup from "./workspace/MemberAvatarGroup";
import InviteMemberPanel from "./workspace/InviteMemberPanel";
import InviteNotification from "./notifications/InviteNotification";
import { useFreeUsage } from "../lib/useFreeUsage";

const navItems = [
  { href: "/dashboard", label: "Home", icon: "H" },
  { href: "/notes", label: "Notes", icon: "N" },
  { href: "/tasks", label: "Tasks", icon: "T" },
  { href: "/ai", label: "AI Tools", icon: "A" },
  { href: "/ai-assistant", label: "AI Assistant", icon: "Q" },
  { href: "/settings", label: "Settings", icon: "S" }
];

export default function AppShell({ title, subtitle, children, rightHeader }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState({
    notes: [],
    tasks: [],
    files: []
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState(null);
  const [resendingMemberId, setResendingMemberId] = useState(null);
  const [account, setAccount] = useState({
    name: "User",
    email: "user@example.com",
    plan: "Free Tier",
    avatarUrl: ""
  });
  const [refreshingWorkspace, setRefreshingWorkspace] = useState(false);
  const workspaceState = useWorkspaceContext();
  const usage = useFreeUsage();

  const loadNotifications = async () => {
    try {
      setNotificationsLoading(true);
      setNotificationsError("");
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const params = new URLSearchParams();
      if (user?.email) {
        params.set("email", user.email);
      }
      const response = await fetch(
        params.toString() ? `/api/notifications?${params.toString()}` : "/api/notifications"
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not load notifications.");
      }
      setNotifications(data?.notifications || []);
    } catch (err) {
      setNotificationsError(err?.message || "Could not load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadAccount = async () => {
      try {
        const {
          data: { user: authUser }
        } = await supabase.auth.getUser();

        if (!active) return;

        if (authUser?.email) {
          setAccount({
            name:
              authUser.user_metadata?.name ||
              authUser.email.split("@")[0] ||
              "User",
            email: authUser.email,
            plan: "Free Tier",
            avatarUrl: authUser.user_metadata?.avatar_url || ""
          });
          return;
        }
      } catch {
        // fall back to local session snapshot
      }

      if (typeof window === "undefined") return;
      const raw = localStorage.getItem("app_session");
      if (!raw) return;
      try {
        const session = JSON.parse(raw);
        if (!active) return;
        if (session?.user?.email) {
          setAccount({
            name: session.user.name || "User",
            email: session.user.email,
            plan: "Free Tier",
            avatarUrl: session.user.avatar_url || ""
          });
        }
      } catch {
        // ignore invalid local state
      }
    };

    const loadTheme = () => {
      if (typeof window === "undefined") return;
      const nextTheme = localStorage.getItem("app_theme") || "dark";
      setTheme(nextTheme === "light" ? "light" : "dark");
    };

    loadTheme();
    loadAccount();
    window.addEventListener("app-profile-change", loadAccount);
    window.addEventListener("app-theme-change", loadTheme);
    return () => {
      active = false;
      window.removeEventListener("app-profile-change", loadAccount);
      window.removeEventListener("app-theme-change", loadTheme);
    };
  }, []);

  useEffect(() => {
    loadNotifications();
    window.addEventListener("app-profile-change", loadNotifications);
    return () => {
      window.removeEventListener("app-profile-change", loadNotifications);
    };
  }, []);

  useEffect(() => {
    if (notificationsOpen) {
      loadNotifications();
    }
  }, [notificationsOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchResults({ notes: [], tasks: [], files: [] });
      setSearchLoading(false);
      setSearchError("");
      return undefined;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError("");
        const {
          data: { user }
        } = await supabase.auth.getUser();
        const params = new URLSearchParams();
        if (user?.email) {
          params.set("email", user.email);
        }
        params.set("q", query);
        const response = await fetch(`/api/search?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Could not search workspace content.");
        }

        if (!active) return;

        setSearchResults({
          notes: (data?.notes || []).slice(0, 6),
          tasks: (data?.tasks || []).slice(0, 6),
          files: (data?.files || []).slice(0, 6)
        });
      } catch (err) {
        if (!active) return;
        setSearchError(err?.message || "Workspace search failed.");
      } finally {
        if (active) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchOpen, searchQuery]);

  const markNotificationsRead = async (notificationId = null) => {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "",
          id: notificationId
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not update notifications.");
      }
      setNotifications((prev) =>
        prev.map((item) =>
          !notificationId || item.id === notificationId ? { ...item, is_read: true } : item
        )
      );
    } catch (err) {
      setNotificationsError(err?.message || "Could not update notifications.");
    }
  };

  const initials = useMemo(
    () =>
      account.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [account.name]
  );

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore signout errors and clear local state anyway
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("app_session");
      }
      router.push("/login");
      setLoggingOut(false);
    }
  };

  const groupedResultCount =
    searchResults.notes.length + searchResults.tasks.length + searchResults.files.length;
  const unreadNotificationCount = notifications.filter((item) => !item.is_read).length;
  const canInvite = ["owner", "admin"].includes(String(workspaceState.membership?.role || "").toLowerCase());

  const inviteMember = async ({ invited_email, role }) => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const response = await fetch("/api/workspace/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user?.email || "",
        invited_email,
        role
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Could not invite member.");
    }

    window.dispatchEvent(new Event("workspace-updated"));
    setNotificationsOpen(false);
    await loadNotifications();
  };

  const removeMember = async (member) => {
    const label = member?.profile?.name || member?.invited_email || "this member";
    const confirmed = window.confirm(`Remove ${label} from the workspace?`);
    if (!confirmed) return;

    setRemovingMemberId(member.id);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/workspace/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "",
          id: member.id
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not remove member.");
      }

      window.dispatchEvent(new Event("workspace-updated"));
      await loadNotifications();
    } catch (err) {
      setNotificationsError(err?.message || "Could not remove member.");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const changeMemberRole = async (member, role) => {
    if (!member?.id || !role || role === member.role) return;

    setUpdatingRoleMemberId(member.id);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/workspace/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "",
          id: member.id,
          role
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not update member role.");
      }

      window.dispatchEvent(new Event("workspace-updated"));
      await loadNotifications();
    } catch (err) {
      setNotificationsError(err?.message || "Could not update member role.");
    } finally {
      setUpdatingRoleMemberId(null);
    }
  };

  const copyMemberEmail = async (member) => {
    const email = member?.invited_email || member?.profile?.email || "";
    if (!email) {
      throw new Error("No email available for this member.");
    }

    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard access is not available in this browser.");
    }

    await navigator.clipboard.writeText(email);
  };

  const resendInvite = async (member) => {
    const invitedEmail = member?.invited_email || member?.profile?.email || "";
    if (!member?.id || !invitedEmail) {
      throw new Error("Invite email is missing.");
    }

    setResendingMemberId(member.id);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const response = await fetch("/api/workspace/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "",
          invited_email: invitedEmail,
          role: member.role
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not resend invite.");
      }

      window.dispatchEvent(new Event("workspace-updated"));
      await loadNotifications();
    } catch (err) {
      setNotificationsError(err?.message || "Could not resend invite.");
      throw err;
    } finally {
      setResendingMemberId(null);
    }
  };

  const workspaceIssue =
    !workspaceState.loading &&
    !workspaceState.ready &&
    (workspaceState.error || !workspaceState.workspace);

  return (
    <main
      className={`min-h-screen p-3 md:p-5 ${
        theme === "light"
          ? "bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#f8fafc_40%,#e2e8f0_100%)]"
          : "bg-[radial-gradient(circle_at_top_left,#1e1b4b_0%,#030712_42%,#020617_100%)]"
      }`}
    >
      {workspaceIssue ? (
        <div className="mx-auto mb-3 max-w-[1500px]">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            <span>
              {workspaceState.error && /workspace not found/i.test(workspaceState.error)
                ? "Workspace session is missing. Sign in again or retry loading your workspace."
                : "Workspace isn’t ready yet. Retry loading or sign in again."}
            </span>
            <button
              type="button"
              disabled={refreshingWorkspace || typeof workspaceState.refresh !== "function"}
              onClick={async () => {
                if (typeof workspaceState.refresh !== "function") return;
                setRefreshingWorkspace(true);
                try {
                  await workspaceState.refresh();
                } finally {
                  setRefreshingWorkspace(false);
                }
              }}
              className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              {refreshingWorkspace ? "Retrying..." : "Retry workspace load"}
            </button>
            <span className="text-[11px] text-amber-200/85">
              If it persists, sign out and sign back in to refresh your session.
            </span>
          </div>
        </div>
      ) : null}

      <div
        className={`mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden rounded-[28px] border backdrop-blur ${
          theme === "light"
            ? "border-slate-300 bg-white/90 shadow-[0_28px_120px_rgba(148,163,184,0.28)]"
            : "border-violet-500/20 bg-slate-950/85 shadow-[0_28px_120px_rgba(10,10,30,0.7)]"
        }`}
      >
        <aside
          className={`hidden w-72 border-r p-5 lg:flex lg:flex-col ${
            theme === "light"
              ? "border-slate-200 bg-white/90"
              : "border-violet-400/15 bg-slate-950/95"
          }`}
        >
          <div
            className={`mb-7 rounded-2xl border p-4 ${
              theme === "light"
                ? "border-sky-200 bg-sky-50"
                : "border-violet-400/20 bg-slate-900/80"
            }`}
          >
            <p className={`text-xs uppercase tracking-[0.2em] ${theme === "light" ? "text-sky-700" : "text-violet-300/90"}`}>Workspace</p>
            <h2 className={`mt-1 text-xl font-semibold ${theme === "light" ? "text-slate-900" : "text-white"}`}>
              {workspaceState.workspace?.name || "Free Plan"}
            </h2>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              {workspaceState.membership?.role
                ? `${workspaceState.membership.role} access`
                : "AI Productivity Platform"}
            </p>
            <div className="mt-4">
              <MemberAvatarGroup members={workspaceState.members || []} theme={theme} />
            </div>
          </div>

          <nav className="space-y-2.5">
            {navItems.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? theme === "light"
                        ? "border border-sky-300 bg-sky-100 text-sky-900"
                        : "border border-violet-400/40 bg-violet-500/20 text-violet-100"
                      : theme === "light"
                        ? "border border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                        : "border border-transparent text-slate-300 hover:border-violet-400/20 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <span className="text-xs opacity-80">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div
            className={`mt-6 rounded-2xl border p-4 ${
              theme === "light"
                ? "border-slate-200 bg-slate-50"
                : "border-violet-400/20 bg-slate-900/80"
            }`}
          >
            <p className={`mb-2 text-xs uppercase tracking-wide ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>Assets</p>
            <ul className={`space-y-1.5 text-xs ${theme === "light" ? "text-slate-700" : "text-slate-300"}`}>
              <li>Library</li>
              <li>Templates</li>
              <li>Reports</li>
            </ul>
          </div>

          <div
            className={`mt-auto rounded-2xl border p-4 ${
              theme === "light"
                ? "border-slate-200 bg-slate-50"
                : "border-slate-800/80 bg-slate-900/80"
            }`}
          >
            <div className="flex items-center gap-3">
              {account.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt={account.name}
                  className="h-11 w-11 rounded-full border border-slate-300 object-cover"
                />
              ) : (
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${
                    theme === "light"
                      ? "bg-sky-100 text-sky-900"
                      : "bg-violet-500/20 text-violet-100"
                  }`}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Link href="/profile" className={`block truncate text-sm font-semibold ${theme === "light" ? "text-slate-900 hover:text-slate-700" : "text-slate-100 hover:text-white"}`}>
                  {account.name}
                </Link>
                <p className={`truncate text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>{account.email}</p>
              </div>
            </div>
            <div
              className={`mt-4 rounded-xl border px-3 py-3 ${
                theme === "light"
                  ? "border-slate-200 bg-white"
                  : "border-slate-800 bg-slate-950/70"
              }`}
            >
              <p className={`text-[11px] uppercase tracking-wide ${theme === "light" ? "text-slate-500" : "text-slate-500"}`}>Plan</p>
              <p className={`mt-1 text-sm font-semibold ${theme === "light" ? "text-slate-900" : "text-slate-100"}`}>{account.plan}</p>
              <p className="mt-1 text-xs text-slate-500">
                {workspaceState.members?.length || 0} member{workspaceState.members?.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-4 w-full rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header
            className={`border-b px-4 py-4 md:px-7 ${
              theme === "light"
                ? "border-slate-200 bg-white/80"
                : "border-violet-400/10 bg-slate-950/65"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className={`text-xl font-semibold md:text-2xl ${theme === "light" ? "text-slate-900" : "text-white"}`}>{title}</h1>
                {subtitle ? <p className={`text-sm ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>{subtitle}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                {usage.remaining !== null && usage.total ? (
                  <span
                    title="Free plan usage"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold md:hidden ${
                      usage.remaining <= 5
                        ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                        : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    }`}
                  >
                    Free plan: {usage.remaining}/{usage.total} left
                  </span>
                ) : null}
                {usage.remaining !== null && usage.total ? (
                  <span
                    title="Free plan usage"
                    className={`hidden rounded-full border px-3 py-1 text-xs font-semibold md:inline-flex ${
                      usage.remaining <= 5
                        ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                        : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    }`}
                  >
                    Free plan: {usage.remaining}/{usage.total} left
                  </span>
                ) : null}
                <div className="hidden md:block">
                  <WorkspaceSwitcher workspace={workspaceState.workspace} theme={theme} />
                </div>
                <div className="hidden md:block">
                  <MemberAvatarGroup members={workspaceState.members || []} theme={theme} />
                </div>
                {canInvite ? (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      theme === "light"
                        ? "border-slate-300 bg-white text-slate-600"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    Invite member
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className={`hidden rounded-xl border px-3 py-2 text-sm md:inline-flex ${
                    theme === "light"
                      ? "border-slate-300 bg-white text-slate-600"
                      : "border-slate-700 bg-slate-950 text-slate-300"
                  }`}
                >
                  Search notes, tasks, files
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className={`relative rounded-xl border px-3 py-2 text-sm ${
                    theme === "light"
                      ? "border-slate-300 bg-white text-slate-600"
                      : "border-slate-700 bg-slate-950 text-slate-300"
                  }`}
                >
                  Notifications
                  {unreadNotificationCount ? (
                    <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {unreadNotificationCount}
                    </span>
                  ) : null}
                </button>
                {rightHeader}
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60 lg:hidden"
                >
                  {loggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`mt-4 w-full rounded-xl border px-3 py-2 text-left text-sm md:hidden ${
                theme === "light"
                  ? "border-slate-300 bg-white text-slate-600"
                  : "border-slate-700 bg-slate-950 text-slate-300"
              }`}
            >
              Search notes, tasks, files
            </button>
            <div className="mt-2 md:hidden">
              <WorkspaceSwitcher workspace={workspaceState.workspace} theme={theme} />
            </div>
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-left text-sm md:hidden ${
                theme === "light"
                  ? "border-slate-300 bg-white text-slate-600"
                  : "border-slate-700 bg-slate-950 text-slate-300"
              }`}
            >
              Notifications {unreadNotificationCount ? `(${unreadNotificationCount})` : ""}
            </button>
            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link
                    key={`mobile-${item.href}`}
                    href={item.href}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? theme === "light"
                          ? "bg-sky-100 text-sky-900"
                          : "bg-violet-500/20 text-violet-100"
                        : theme === "light"
                          ? "border border-slate-300 text-slate-600"
                          : "border border-slate-700 text-slate-300"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-7">{children}</div>
        </section>
      </div>
      {notificationsOpen ? (
        <div className="fixed right-4 top-24 z-50 w-full max-w-md">
          <div
            className={`rounded-3xl border p-4 shadow-2xl ${
              theme === "light"
                ? "border-slate-300 bg-white"
                : "border-slate-800 bg-slate-950"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className={theme === "light" ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-white"}>
                Notifications
              </h3>
              <button
                type="button"
                onClick={() => markNotificationsRead()}
                className="text-xs font-semibold text-indigo-400"
              >
                Mark all read
              </button>
            </div>
            {notificationsLoading ? (
              <p className="mt-4 text-sm text-slate-400">Loading notifications...</p>
            ) : null}
            {notificationsError ? (
              <p className="mt-4 text-sm text-rose-300">{notificationsError}</p>
            ) : null}
            {!notificationsLoading && !notifications.length ? (
              <p className="mt-4 text-sm text-slate-400">No notifications yet.</p>
            ) : null}
            <div className="mt-4 max-h-[24rem] space-y-2 overflow-y-auto">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => markNotificationsRead(item.id)}
                  className={`block w-full rounded-2xl border px-3 py-3 text-left ${
                    item.is_read
                      ? theme === "light"
                        ? "border-slate-200 bg-slate-50 text-slate-700"
                        : "border-slate-800 bg-slate-900 text-slate-300"
                      : "border-indigo-500/30 bg-indigo-500/10 text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{item.title}</p>
                    {!item.is_read ? (
                      <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs opacity-80">{item.body}</p>
                  <InviteNotification item={item} />
                  <p className="mt-2 text-[11px] opacity-60">{item.relative_time}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <InviteMemberPanel
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={inviteMember}
        onRemove={removeMember}
        onRoleChange={changeMemberRole}
        onCopyEmail={copyMemberEmail}
        onResendInvite={resendInvite}
        members={workspaceState.members || []}
        canManage={canInvite}
        removingMemberId={removingMemberId}
        updatingRoleMemberId={updatingRoleMemberId}
        resendingMemberId={resendingMemberId}
        theme={theme}
      />
      {searchOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 py-10 backdrop-blur-sm">
          <div
            className={`w-full max-w-3xl rounded-3xl border p-4 shadow-2xl ${
              theme === "light"
                ? "border-slate-300 bg-white"
                : "border-slate-800 bg-slate-950"
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notes, tasks, and files..."
                autoFocus
                className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none ${
                  theme === "light"
                    ? "border-slate-300 bg-slate-50 text-slate-900"
                    : "border-slate-700 bg-slate-900 text-slate-100"
                }`}
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <p className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
                Search results are grouped by content type.
              </p>
              <p className={theme === "light" ? "text-slate-500" : "text-slate-500"}>
                {searchLoading ? "Searching..." : `${groupedResultCount} result${groupedResultCount === 1 ? "" : "s"}`}
              </p>
            </div>
            {searchError ? (
              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {searchError}
              </div>
            ) : null}
            {!searchLoading &&
            !searchError &&
            searchQuery.trim() &&
            groupedResultCount === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
                No notes, tasks, or AI history matched your search.
              </div>
            ) : null}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <SearchGroup
                title="Notes"
                items={searchResults.notes}
                href="/notes"
                theme={theme}
                renderMeta={(item) => `${item.category || "idea"}${item.pinned ? " • pinned" : ""}`}
                onOpen={(href) => {
                  setSearchOpen(false);
                  router.push(href);
                }}
              />
              <SearchGroup
                title="Tasks"
                items={searchResults.tasks}
                href="/tasks"
                theme={theme}
                renderMeta={(item) => String(item.status || "todo").replace("_", " ")}
                onOpen={(href) => {
                  setSearchOpen(false);
                  router.push(href);
                }}
              />
              <SearchGroup
                title="Files"
                items={searchResults.files}
                href="/notes"
                theme={theme}
                renderMeta={(item) =>
                  `${item.file_type || "file"} • ${new Date(item.created_at || Date.now()).toLocaleString()}`
                }
                onOpen={(href) => {
                  setSearchOpen(false);
                  router.push(href);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SearchGroup({ title, items, href, renderMeta, onOpen, theme }) {
  return (
    <section
      className={`rounded-2xl border p-3 ${
        theme === "light"
          ? "border-slate-200 bg-slate-50"
          : "border-slate-800 bg-slate-900/70"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className={theme === "light" ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-white"}>
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onOpen(href)}
          className="text-xs font-semibold text-indigo-400"
        >
          Open
        </button>
      </div>
      {items.length === 0 ? (
        <p className={theme === "light" ? "text-xs text-slate-500" : "text-xs text-slate-500"}>
          No matches.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={`${title}-${item.id}`}
              type="button"
              onClick={() => onOpen(href)}
              className={`block w-full rounded-xl border px-3 py-2 text-left ${
                theme === "light"
                  ? "border-slate-200 bg-white text-slate-800"
                  : "border-slate-800 bg-slate-950 text-slate-200"
              }`}
            >
              <p className="truncate text-sm font-medium">{item.title || item.file_name || item.name || "Untitled"}</p>
              <p className={theme === "light" ? "mt-1 text-[11px] text-slate-500" : "mt-1 text-[11px] text-slate-500"}>
                {renderMeta(item)}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
