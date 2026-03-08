import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name }
        }
      });

      if (authError) {
        throw new Error(authError.message || "Signup failed.");
      }

      const syncResponse = await fetch("/api/auth/sync-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: data?.user?.email || email
        })
      });
      const syncData = await syncResponse.json();
      if (!syncResponse.ok) {
        throw new Error(syncData?.error || "Failed to save user profile.");
      }

      router.push("/login");
    } catch (err) {
      setError(err?.message || "Signup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
        <h1 className="text-2xl font-semibold text-white">Sign Up</h1>
        <p className="mt-1 text-sm text-slate-400">Create your AI productivity account</p>
        <form className="mt-5 space-y-3" onSubmit={signup}>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
          />
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
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        <p className="mt-4 text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-300">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
