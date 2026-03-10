import { WeeklyPerformanceChart } from "../charts";
import { SurfaceCard, MetricCard } from "../ui/cards";
import { formatINR } from "../../../lib/currency";

export function DashboardHome({
  overview,
  metrics,
  dashboardError,
  seedLoading = false,
  seedError = "",
  seedMessage = "",
  onSeedSales
}) {
  const taskSchedule = overview.task_schedule || [];
  const recentActivity = overview.recent_activity || [];
  const teamStats = metrics.teamStats || {
    total_members: 0,
    active_tasks: 0,
    completed_tasks: 0,
    recent_activity_count: 0
  };

  const insights = (() => {
    const completed = metrics.completedTasks || 0;
    const pending = metrics.pendingTasks || 0;
    const weekly = overview.weekly_productivity || [];
    const bestDay =
      weekly.reduce(
        (best, day) =>
          day.tasks > (best.tasks || 0) ? day : best,
        weekly[0] || { day: "", tasks: 0 }
      )?.day || "N/A";

    return [
      `Tasks completed this week: ${completed}`,
      `Pending tasks: ${pending}`,
      `Best productivity day: ${bestDay}`
    ];
  })();

  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-4">
        {dashboardError ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {dashboardError}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total Notes"
            value={`${metrics.totalNotes.toLocaleString()}`}
          />
          <MetricCard
            label="Completed Tasks"
            value={`${metrics.completedTasks.toLocaleString()}`}
          />
          <MetricCard
            label="Pending Tasks"
            value={`${metrics.pendingTasks.toLocaleString()}`}
          />
          <MetricCard
            label="Total Revenue"
            value={formatINR(metrics.totalRevenue)}
          />
          <MetricCard
            label="Total Products"
            value={`${metrics.totalProducts.toLocaleString()}`}
          />
        </div>
        {metrics.totalRevenue === 0 && (overview.transactions || []).length === 0 ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Total revenue is zero because there are no sales records yet. Add rows to the{" "}
            <code className="rounded bg-slate-950/60 px-1 py-0.5 text-xs">sales</code> table, or
            use the button below to insert demo sales.
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSeedSales}
                disabled={seedLoading}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {seedLoading ? "Adding demo sales..." : "Add demo sales"}
              </button>
              {seedMessage ? <span className="text-emerald-200">{seedMessage}</span> : null}
              {seedError ? <span className="text-rose-200">{seedError}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Team Members" value={`${teamStats.total_members || 0}`} />
          <MetricCard label="Active Tasks" value={`${teamStats.active_tasks || 0}`} />
          <MetricCard label="Team Done" value={`${teamStats.completed_tasks || 0}`} />
          <MetricCard label="Recent Activity" value={`${teamStats.recent_activity_count || 0}`} />
        </div>

        <SurfaceCard title="AI Insights">
          <div className="space-y-1 text-sm text-slate-200">
            {insights.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="text-xs text-slate-500">
              Insights are generated from your workspace tasks, notes, and weekly activity.
            </p>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Weekly Performance">
          <WeeklyPerformanceChart data={overview.weekly_productivity} />
        </SurfaceCard>

        <SurfaceCard title="Task Manager">
          <div className="grid gap-3 md:grid-cols-2">
            {taskSchedule.length === 0 ? (
              <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3 text-sm text-slate-400">
                No tasks available yet.
              </div>
            ) : null}
            {taskSchedule.map((task) => (
              <div
                key={task.id || task.title}
                className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3"
              >
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{task.time}</span>
                  <span>{task.tag}</span>
                </div>
                <p className="text-sm text-white">{task.title}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {task.assignee_name || "Unassigned"}{task.due_date ? ` • due ${task.due_date}` : ""}
                </p>
                <div className="mt-3 h-2 rounded-full bg-[#1a2233]">
                  <div
                    className="h-2 rounded-full bg-cyan-400"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <div className="space-y-4">
        <SurfaceCard title="Recent Activity">
          <div className="space-y-3">
            {recentActivity.length === 0 ? (
              <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3 text-sm text-slate-400">
                No recent activity yet.
              </div>
            ) : null}
            {recentActivity.map((event) => (
              <div
                key={event.id || event.text}
                className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3 text-sm text-slate-200"
              >
                <p>{event.text}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {event.relative_time || event.created_at || ""}
                </p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
