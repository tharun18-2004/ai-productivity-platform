import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const bootstrapRecovery = async () => {
      try {
        setLoading(true);
        setError("");

        if (typeof window === "undefined") return;

        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const errorDescription =
          searchParams.get("error_description") || hashParams.get("error_description") || "";

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription));
        }

        const authCode = searchParams.get("code");
        if (authCode) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError) {
            throw new Error(exchangeError.message || "Could not verify the reset link.");
          }
          window.history.replaceState({}, "", "/reset-password");
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw new Error(sessionError.message || "Could not validate the reset session.");
        }

        if (!active) return;

        const hasRecoveryTokens =
          hashParams.has("access_token") ||
          hashParams.get("type") === "recovery" ||
          searchParams.get("type") === "recovery";

        if (sessionData?.session || hasRecoveryTokens) {
          setReady(true);
          setMessage("Enter a new password to finish recovering your account.");
          return;
        }

        setError("This reset link is invalid or has expired. Request a new password reset email.");
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Could not validate the password reset link.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setLoading(false);
        setError("");
        setMessage("Enter a new password to finish recovering your account.");
      }
    });

    bootstrapRecovery();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!ready) {
      setError("Open a valid password reset link first.");
      return;
    }

    if (password.length < 6) {
      setError("Use a password with at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSaving(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw new Error(updateError.message || "Could not update the password.");
      }

      await supabase.auth.signOut().catch(() => null);
      setMessage("Password updated. Sign in with your new password.");
      setPassword("");
      setConfirmPassword("");
      setReady(false);

      setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (err) {
      setError(err?.message || "Could not update the password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/90 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white">Reset Password</h1>
        <p className="mt-1 text-sm text-slate-400">
          Finish the Supabase recovery flow and set a new password.
        </p>

        <div className="mt-5 space-y-3">
          {loading ? <Notice message="Checking your password reset link..." /> : null}
          {!loading && message ? <Notice tone="success" message={message} /> : null}
          {!loading && error ? <Notice tone="error" message={error} /> : null}
        </div>

        <form className="mt-5 space-y-3" onSubmit={updatePassword}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading || saving || !ready}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={loading || saving || !ready}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || saving || !ready}
            className="block w-full rounded-xl bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Updating password..." : "Update password"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-400">
          Need a fresh link?{" "}
          <Link href="/settings" className="text-indigo-300">
            Go back to settings
          </Link>
        </p>
      </section>
    </main>
  );
}
