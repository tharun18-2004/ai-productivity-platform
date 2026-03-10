import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finalizeLogin = async (authUser, fallbackEmail = "") => {
    await fetch("/api/auth/sync-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:
          authUser?.user_metadata?.name ||
          authUser?.email?.split("@")[0] ||
          "User",
        email: authUser?.email || fallbackEmail,
        previous_email: authUser?.user_metadata?.previous_email || ""
      })
    }).catch(() => null);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        "app_session",
        JSON.stringify({
          user: {
            id: authUser?.id || null,
            name:
              authUser?.user_metadata?.name ||
              authUser?.email?.split("@")[0] ||
              "User",
            email: authUser?.email || fallbackEmail
          }
        })
      );
    }
    router.push("/dashboard");
  };

  const login = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (authError) {
        throw new Error(authError.message || "Login failed.");
      }

      const authUser = data?.user;
      await finalizeLogin(authUser, email);
    } catch (err) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
        <h1 className="text-2xl font-semibold text-white">Login</h1>
        <p className="mt-1 text-sm text-slate-400">Access your productivity workspace</p>
        <form className="mt-5 space-y-3" onSubmit={login}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="block w-full rounded-xl bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        <p className="mt-3 text-sm text-slate-400">
          Forgot your password?{" "}
          <Link href="/forgot-password" className="text-indigo-300">
            Reset it
          </Link>
        </p>
        <p className="mt-4 text-sm text-slate-400">
          New here?{" "}
          <Link href="/signup" className="text-indigo-300">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
