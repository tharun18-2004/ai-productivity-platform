export default function WorkspaceSwitcher({ workspace, theme = "dark" }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-left ${
        theme === "light"
          ? "border-slate-300 bg-white text-slate-700"
          : "border-slate-700 bg-slate-950 text-slate-200"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">Workspace</p>
      <p className="truncate text-sm font-semibold">{workspace?.name || "Workspace"}</p>
      <p className="text-[11px] opacity-60">Single workspace mode</p>
    </div>
  );
}
