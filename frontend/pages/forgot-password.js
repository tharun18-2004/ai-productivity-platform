import Link from "next/link";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

function Notice({ tone = "info", message }) {
  if (!message) return null;

  const styles =
    tone === "error"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
      : tone === "success"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
        : "border-slate-700 bg-slate-900/80 text-slate-300";

  return <div className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{message}</div>;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      if (resetError) {
        throw new Error(resetError.message || "Could not send the password reset email.");
      }

      setMessage("Password reset email sent. Open the newest email and follow the link.");
      setEmail("");
    } catch (err) {
      setError(err?.message || "Could not send the password reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/90 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white">Forgot Password</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter your email and we will send you a password reset link.
        </p>

        <div className="mt-5 space-y-3">
          {message ? <Notice tone="success" message={message} /> : null}
          {error ? <Notice tone="error" message={error} /> : null}
        </div>

        <form className="mt-5 space-y-3" onSubmit={requestReset}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="block w-full rounded-xl bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Sending reset email..." : "Send reset email"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-400">
          Remembered it?{" "}
          <Link href="/login" className="text-indigo-300">
            Back to login
          </Link>
        </p>
      </section>
    </main>
  );
}
