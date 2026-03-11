import { useEffect, useMemo, useState } from "react";
import { fallbackOverview } from "../data";
import { supabase } from "../../../lib/supabaseClient";

export function useDashboardData(enabled = true) {
  const [overview, setOverview] = useState(fallbackOverview);
  const [dashboardLoading, setDashboardLoading] = useState(enabled);
  const [dashboardStats, setDashboardStats] = useState({
    total_notes: 0,
    completed_tasks: 0,
    pending_tasks: 0,
    total_revenue: 0,
    total_products: 0,
    team_stats: {
      total_members: 0,
      active_tasks: 0,
      completed_tasks: 0,
      recent_activity_count: 0
    }
  });
  const [dashboardError, setDashboardError] = useState("");
  const [workspaceId, setWorkspaceId] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setDashboardLoading(false);
      return undefined;
    }

    let mounted = true;

    const load = async () => {
      setDashboardError("");
      setDashboardLoading(true);
      try {
        const {
          data: { user: authUser }
        } = await supabase.auth.getUser();
        const params = new URLSearchParams();
        if (authUser?.email) {
          params.set("email", authUser.email);
        }
        const url = params.toString() ? `/api/dashboard?${params.toString()}` : "/api/dashboard";
        const dashboardResp = await fetch(url).then(async (r) => {
          const json = await r.json();
          if (!r.ok) throw new Error(json?.error || "Dashboard API failed");
          return { data: json };
        });

        if (!mounted) return;

        const dashboardData = dashboardResp?.data || {};
        setWorkspaceId(dashboardData?.workspace?.id ?? null);
        setOverview({
          ...fallbackOverview,
          user: dashboardData.user || fallbackOverview.user,
          total_notes: Number(dashboardData.total_notes || 0),
          completed_tasks: Number(dashboardData.completed_tasks || 0),
          pending_tasks: Number(dashboardData.pending_tasks || 0),
          ai_requests: Number(dashboardData.ai_requests || 0),
          sales_overview:
            dashboardData.sales_overview || fallbackOverview.sales_overview,
          weekly_productivity:
            dashboardData.weekly_performance || fallbackOverview.weekly_productivity,
          task_schedule:
            dashboardData.task_schedule || fallbackOverview.task_schedule,
          recent_activity:
            dashboardData.recent_activity || fallbackOverview.recent_activity,
          top_products:
            dashboardData.top_products || fallbackOverview.top_products,
          stock_status:
            dashboardData.stock_status || fallbackOverview.stock_status,
          transactions:
            dashboardData.transactions || fallbackOverview.transactions,
          sales_by_day:
            dashboardData.sales_by_day || fallbackOverview.sales_by_day,
          product_activity:
            dashboardData.product_activity || fallbackOverview.product_activity
        });

        setDashboardStats({
          total_notes: Number(dashboardData.total_notes || 0),
          completed_tasks: Number(dashboardData.completed_tasks || 0),
          pending_tasks: Number(dashboardData.pending_tasks || 0),
          total_revenue: Number(dashboardData.total_revenue || 0),
          total_products: Number(dashboardData.total_products || 0),
          team_stats: dashboardData.team_stats || {
            total_members: 0,
            active_tasks: 0,
            completed_tasks: 0,
            recent_activity_count: 0
          }
        });
      } catch (err) {
        if (!mounted) return;

        setDashboardError(
          err?.message || "Failed to load dashboard metrics from Supabase."
        );
        setOverview({ ...fallbackOverview });
        setDashboardStats({
          total_notes: 0,
          completed_tasks: 0,
          pending_tasks: 0,
          total_revenue: 0,
          total_products: 0,
          team_stats: {
            total_members: 0,
            active_tasks: 0,
            completed_tasks: 0,
            recent_activity_count: 0
          }
        });
      } finally {
        if (mounted) {
          setDashboardLoading(false);
        }
      }
    };

    load();
    const refresh = () => load();
    window.addEventListener("dashboard-refresh", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("dashboard-refresh", refresh);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !workspaceId) return undefined;

    const channel = supabase
      .channel(`dashboard-workspace-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => window.dispatchEvent(new Event("dashboard-refresh"))
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => window.dispatchEvent(new Event("dashboard-refresh"))
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_logs",
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => window.dispatchEvent(new Event("dashboard-refresh"))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, workspaceId]);

  const metrics = useMemo(
    () => ({
      totalNotes: dashboardStats.total_notes,
      completedTasks: dashboardStats.completed_tasks,
      pendingTasks: dashboardStats.pending_tasks,
      totalRevenue: dashboardStats.total_revenue,
      totalProducts: dashboardStats.total_products,
      teamStats: dashboardStats.team_stats
    }),
    [dashboardStats]
  );

  return { overview, metrics, dashboardError, dashboardLoading };
}
