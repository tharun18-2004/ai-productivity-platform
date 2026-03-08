import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-950/80 p-8 text-center shadow-[0_20px_80px_rgba(15,23,42,0.45)]">
        <p className="text-xs uppercase tracking-[0.25em] text-indigo-300">AI Productivity Workspace</p>
        <h1 className="mt-4 text-4xl font-bold text-white md:text-5xl">Notion-Style Work Hub + AI Assistant</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-300">
          Manage notes, tasks, and AI workflows in one unified workspace built with Next.js + Node.js.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white">
            Open Dashboard
          </Link>
          <Link href="/login" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200">
            Login
          </Link>
          <Link href="/signup" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200">
            Sign Up
          </Link>
        </div>
      </section>
    </main>
  );
}
