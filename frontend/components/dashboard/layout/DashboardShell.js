import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { dashboardNav } from "../data";

export function DashboardShell({ activeKey, title, children, user }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");

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

  const handleInvite = async () => {
    const inviteUrl =
      typeof window !== "undefined" ? `${window.location.origin}/signup` : "/signup";

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteStatus("Invite link copied.");
        return;
      }

      if (typeof window !== "undefined") {
        window.prompt("Copy this invite link", inviteUrl);
        setInviteStatus("Invite link ready to copy.");
      }
    } catch {
      setInviteStatus("Could not copy invite link.");
    }
  };

  return (
    <main className="min-h-screen bg-[#070b12] p-3 md:p-6">
      <div className="mx-auto max-w-[1600px] rounded-[30px] border border-[#121b2a] bg-[#05080f] p-3 shadow-[0_50px_160px_rgba(0,0,0,0.72)] md:p-4">
        <div className="grid gap-4 xl:grid-cols-[250px_1fr]">
          <aside className="hidden rounded-2xl border border-[#1a2233] bg-[#080d15] p-4 xl:block">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-white">Workspace</p>
                <p className="text-xs text-slate-500">Free Plan</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500" />
            </div>

            <nav className="space-y-1 text-sm">
              {dashboardNav.map((item) => {
                const isActive =
                  item.key === activeKey ||
                  (activeKey === "dashboard" && item.key === "home");
                return (
                  <Link
                    key={`${item.key}-${item.href}`}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 transition ${
                      isActive
                        ? "bg-[#141f32] text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 rounded-xl border border-[#1a2233] bg-[#0c131e] p-3">
              <p className="text-sm font-semibold text-white">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="mt-3 w-full rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </aside>

          <section className="space-y-4">
            <header className="rounded-2xl border border-[#1a2233] bg-[#080d15] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-sm text-slate-300 md:text-base">{title}</h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleInvite}
                    className="rounded-lg border border-[#2a3448] bg-[#121a29] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Invite
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60 xl:hidden"
                  >
                    {loggingOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              </div>
              {inviteStatus ? (
                <p className="mt-3 text-xs text-cyan-300">{inviteStatus}</p>
              ) : null}
              <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:hidden">
                {dashboardNav.map((item) => {
                  const isActive =
                    item.key === activeKey ||
                    (activeKey === "dashboard" && item.key === "home");
                  return (
                    <Link
                      key={`mobile-${item.key}-${item.href}`}
                      href={item.href}
                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "bg-[#141f32] text-white"
                          : "border border-[#2a3448] bg-[#121a29] text-slate-300"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </header>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
