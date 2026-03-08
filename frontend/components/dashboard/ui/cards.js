export function SurfaceCard({ title, right, className = "", children }) {
  return (
    <section className={`rounded-2xl border border-[#1a2233] bg-[#0b111a] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, delta, accent = "text-emerald-300" }) {
  const positive = typeof delta === "number" ? delta >= 0 : true;
  return (
    <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {typeof delta === "number" ? (
        <p className={`mt-1 text-sm ${accent}`}>
          {positive ? "+" : ""}
          {delta}%
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({ label, value, status }) {
  const tone =
    status === "healthy"
      ? "bg-emerald-400"
      : status === "warning"
        ? "bg-amber-400"
        : "bg-rose-400";
  const textTone =
    status === "healthy"
      ? "text-emerald-300"
      : status === "warning"
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-200">{label}</span>
        <span className={textTone}>{status}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-[#182235]">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
