import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const plans = [
  {
    name: "Free",
    price: "$0",
    blurb: "For individuals trying the workspace.",
    features: ["1 workspace", "Notes & tasks", "Basic AI prompts", "Email support"]
  },
  {
    name: "Team",
    price: "$29 /mo",
    blurb: "For small teams that need realtime collaboration.",
    features: ["Unlimited members", "Realtime notes & tasks", "AI summaries", "Workspace search"]
  },
  {
    name: "Scale",
    price: "$79 /mo",
    blurb: "For startups that need governance and access controls.",
    features: ["Role management", "Audit activity feed", "Priority support", "API access"]
  }
];

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));

      if (!active) return;
      setAuthenticated(Boolean(session?.user));
    };

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthenticated(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-8 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)]">
          <p className="text-xs uppercase tracking-[0.25em] text-indigo-300">AI Productivity Workspace</p>
          <h1 className="mt-4 text-4xl font-bold text-white md:text-5xl">Notion-Style Work Hub + AI Assistant</h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            Manage notes, tasks, and AI workflows in one unified workspace built with Next.js + Node.js.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={authenticated ? "/dashboard" : "/login"}
              className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white"
            >
              {authenticated ? "Open Dashboard" : "Login to Continue"}
            </Link>
            <Link href="/login" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200">
              Login
            </Link>
            <Link href="/signup" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200">
              Sign Up
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-300">Pricing</p>
            <h2 className="text-3xl font-bold text-white">Simple plans that grow with you</h2>
            <p className="text-slate-300">Start free, add your team, and scale with collaboration, auditability, and AI.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
                    {plan.price}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{plan.blurb}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-200">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  <Link
                    href={authenticated ? "/dashboard" : "/signup"}
                    className="inline-block w-full rounded-lg bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-400"
                  >
                    {authenticated ? "Add teammates" : "Start free"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
