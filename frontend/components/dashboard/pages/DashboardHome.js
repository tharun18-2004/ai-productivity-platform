import { WeeklyPerformanceChart } from "../charts";
import { SurfaceCard, MetricCard } from "../ui/cards";
import { formatINR } from "../../../lib/currency";

export function DashboardHome({ overview, metrics, dashboardError }) {
  const taskSchedule = overview.task_schedule || [];
  const recentActivity = overview.recent_activity || [];
  const teamStats = metrics.teamStats || {
    total_members: 0,
    active_tasks: 0,
    completed_tasks: 0,
    recent_activity_count: 0
  };

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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Team Members" value={`${teamStats.total_members || 0}`} />
          <MetricCard label="Active Tasks" value={`${teamStats.active_tasks || 0}`} />
          <MetricCard label="Team Done" value={`${teamStats.completed_tasks || 0}`} />
          <MetricCard label="Recent Activity" value={`${teamStats.recent_activity_count || 0}`} />
        </div>

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
