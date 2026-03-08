import AppShell from "../components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ProfilePage() {
  const [user, setUser] = useState({
    name: "User",
    email: "user@example.com",
    avatarUrl: ""
  });
  const [stats, setStats] = useState({
    notes: 0,
    tasks: 0,
    aiUses: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      if (active) {
        setLoading(true);
        setError("");
      }
      try {
        const {
          data: { user: authUser }
        } = await supabase.auth.getUser();

        if (!active) return;

        const email = authUser?.email || "";
        const name =
          authUser?.user_metadata?.name || email.split("@")[0] || "User";

        setUser({
          name,
          email: email || "user@example.com",
          avatarUrl: authUser?.user_metadata?.avatar_url || ""
        });

        const params = new URLSearchParams();
        if (email) {
          params.set("email", email);
        }
        const response = await fetch(
          params.toString() ? `/api/dashboard?${params.toString()}` : "/api/dashboard"
        );
        const data = await response.json();
        if (!response.ok || !active) {
          throw new Error(data?.error || "Could not load profile stats.");
        }

        setStats({
          notes: Number(data?.total_notes || 0),
          tasks: Number(data?.completed_tasks || 0) + Number(data?.pending_tasks || 0),
          aiUses: Number(data?.ai_requests || 0)
        });
      } catch (err) {
        if (active) {
          setError(err?.message || "Could not load profile details.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    window.addEventListener("app-profile-change", loadProfile);
    return () => {
      active = false;
      window.removeEventListener("app-profile-change", loadProfile);
    };
  }, []);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppShell title="Profile" subtitle="Your account summary">
      <section className="max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        {loading ? (
          <div className="space-y-4">
            <div className="h-16 animate-pulse rounded-2xl bg-slate-800/80" />
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`profile-skeleton-${index}`} className="h-24 animate-pulse rounded-xl bg-slate-800/80" />
              ))}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        {!loading ? (
          <>
            <div className="flex items-center gap-4">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-16 w-16 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20 text-xl font-bold text-indigo-200">
                  {initials}
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-white">{user.name}</h3>
                <p className="text-sm text-slate-400">{user.email}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <p className="text-xs text-slate-400">Notes</p>
                <p className="text-2xl font-bold text-sky-300">{stats.notes}</p>
              </article>
              <article className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <p className="text-xs text-slate-400">Tasks</p>
                <p className="text-2xl font-bold text-emerald-300">{stats.tasks}</p>
              </article>
              <article className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <p className="text-xs text-slate-400">AI Uses</p>
                <p className="text-2xl font-bold text-violet-300">{stats.aiUses}</p>
              </article>
            </div>
            {stats.notes === 0 && stats.tasks === 0 && stats.aiUses === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                Your workspace is empty right now. Create notes, tasks, or AI requests to build activity here.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
