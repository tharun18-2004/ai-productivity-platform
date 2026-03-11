import { formatRelativeTime } from "../../lib/serverActivity";
import { listWorkspaceMembers, resolveWorkspaceContextFromRequest } from "../../lib/workspaceServer";

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildLast7Days() {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }
  return days;
}

function formatDayLabel(date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function inRange(value, from, to) {
  const time = new Date(value).getTime();
  return time >= from.getTime() && time < to.getTime();
}

function percentageChange(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0 && currentValue === 0) return null;
  if (previousValue === 0) return 100;
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

function fallbackUser(email = "") {
  const safeEmail = String(email || "").trim().toLowerCase();
  return {
    id: null,
    name: safeEmail ? safeEmail.split("@")[0] : "User",
    email: safeEmail || "user@example.com"
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: true
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const notesQuery = context.supabase
      .from("notes")
      .select("id,title,created_at", { count: "exact" })
      .eq("workspace_id", context.workspace.id);
    const doneTasksQuery = context.supabase
      .from("tasks")
      .select("id", { count: "exact" })
      .eq("workspace_id", context.workspace.id)
      .eq("status", "done");
    const pendingTasksQuery = context.supabase
      .from("tasks")
      .select("id", { count: "exact" })
      .eq("workspace_id", context.workspace.id)
      .eq("status", "todo");
    const allTasksQuery = context.supabase
      .from("tasks")
      .select("id,title,status,created_at,due_date,assigned_to")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false });
    const activityLogsQuery = context.supabase
      .from("activity_logs")
      .select("id,action_type,description,entity_type,entity_id,created_at")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const salesQuery = context.supabase
      .from("sales")
      .select("id,product,price,customer,date")
      .eq("workspace_id", context.workspace.id)
      .order("date", { ascending: false });
    const productsQuery = context.supabase
      .from("products")
      .select("id,name,price,stock", { count: "exact" });
    const scopedProductsQuery = productsQuery.eq("workspace_id", context.workspace.id);
    const aiConversationsQuery = context.supabase
      .from("ai_conversations")
      .select("id,user_id")
      .eq("user_id", context.user.id);

    const [
      { data: notesData, count: notesCount, error: notesError },
      { count: doneCount, error: doneError },
      { count: pendingCount, error: pendingError },
      { data: allTasksData, error: allTasksError },
      { data: activityLogsData, error: activityLogsError },
      { data: salesData, error: salesError },
      { data: productsData, count: productsCount, error: productsError },
      { data: aiConversationsData, error: aiConversationsError },
      members
    ] = await Promise.all([
      notesQuery,
      doneTasksQuery,
      pendingTasksQuery,
      allTasksQuery,
      activityLogsQuery,
      salesQuery,
      scopedProductsQuery,
      aiConversationsQuery,
      listWorkspaceMembers(context.supabase, context.workspace.id)
    ]);

    let aiMessagesQuery = context.supabase
      .from("ai_messages")
      .select("id,role,task,content,created_at,conversation_id")
      .eq("role", "assistant")
      .order("created_at", { ascending: false });
    const aiConversationIds = (aiConversationsData || []).map((item) => item.id);
    aiMessagesQuery = aiConversationIds.length
      ? aiMessagesQuery.in("conversation_id", aiConversationIds)
      : aiMessagesQuery.in("conversation_id", [-1]);
    const { data: aiMessagesData, error: aiMessagesError } = await aiMessagesQuery;

    const firstError =
      notesError ||
      doneError ||
      pendingError ||
      allTasksError ||
      activityLogsError ||
      salesError ||
      productsError ||
      aiConversationsError ||
      aiMessagesError;
    if (firstError) {
      return res.status(500).json({ error: firstError.message });
    }

    const totalRevenue = (salesData || []).reduce((sum, row) => sum + (Number(row.price) || 0), 0);

    const today = startOfDay(new Date());
    const currentPeriodStart = new Date(today);
    currentPeriodStart.setDate(today.getDate() - 6);
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(currentPeriodStart.getDate() - 7);
    const currentPeriodEnd = new Date(today);
    currentPeriodEnd.setDate(today.getDate() + 1);

    const currentRevenue = (salesData || []).reduce((sum, sale) => {
      if (!sale?.date || !inRange(sale.date, currentPeriodStart, currentPeriodEnd)) return sum;
      return sum + (Number(sale.price) || 0);
    }, 0);
    const previousRevenue = (salesData || []).reduce((sum, sale) => {
      if (!sale?.date || !inRange(sale.date, previousPeriodStart, currentPeriodStart)) return sum;
      return sum + (Number(sale.price) || 0);
    }, 0);
    const currentOrders = (salesData || []).filter(
      (sale) => sale?.date && inRange(sale.date, currentPeriodStart, currentPeriodEnd)
    ).length;
    const previousOrders = (salesData || []).filter(
      (sale) => sale?.date && inRange(sale.date, previousPeriodStart, currentPeriodStart)
    ).length;
    const currentCompletedTasks = (allTasksData || []).filter(
      (task) =>
        task?.created_at &&
        task?.status === "done" &&
        inRange(task.created_at, currentPeriodStart, currentPeriodEnd)
    ).length;
    const previousCompletedTasks = (allTasksData || []).filter(
      (task) =>
        task?.created_at &&
        task?.status === "done" &&
        inRange(task.created_at, previousPeriodStart, currentPeriodStart)
    ).length;
    const currentAiRequests = (aiMessagesData || []).filter(
      (message) => message?.created_at && inRange(message.created_at, currentPeriodStart, currentPeriodEnd)
    ).length;
    const previousAiRequests = (aiMessagesData || []).filter(
      (message) => message?.created_at && inRange(message.created_at, previousPeriodStart, currentPeriodStart)
    ).length;

    const topProductsMap = new Map();
    (salesData || []).forEach((sale) => {
      const key = sale.product || "Unknown";
      const current = topProductsMap.get(key) || {
        id: key,
        name: key,
        sales: 0,
        revenue: 0,
        popularity: 0
      };
      current.sales += 1;
      current.revenue += Number(sale.price) || 0;
      topProductsMap.set(key, current);
    });

    const topProducts = Array.from(topProductsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((item, index, arr) => ({
        ...item,
        id: index + 1,
        popularity:
          arr.length > 0 && arr[0].revenue > 0
            ? Math.max(10, Math.round((item.revenue / arr[0].revenue) * 100))
            : 0
      }));

    const last7 = buildLast7Days();
    const notesByDay = new Map();
    const tasksByDay = new Map();
    const salesByDay = new Map();
    const aiByDay = new Map();

    (notesData || []).forEach((row) => {
      if (!row.created_at) return;
      const key = dateKey(new Date(row.created_at));
      notesByDay.set(key, (notesByDay.get(key) || 0) + 1);
    });

    (allTasksData || []).forEach((row) => {
      if (!row.created_at) return;
      const key = dateKey(new Date(row.created_at));
      tasksByDay.set(key, (tasksByDay.get(key) || 0) + 1);
    });

    (aiMessagesData || []).forEach((row) => {
      if (!row.created_at) return;
      const key = dateKey(new Date(row.created_at));
      aiByDay.set(key, (aiByDay.get(key) || 0) + 1);
    });

    (salesData || []).forEach((row) => {
      if (!row.date) return;
      const key = dateKey(new Date(row.date));
      salesByDay.set(key, (salesByDay.get(key) || 0) + (Number(row.price) || 0));
    });

    const weeklyPerformance = last7.map((d) => {
      const key = dateKey(d);
      return {
        day: formatDayLabel(d),
        notes: notesByDay.get(key) || 0,
        tasks: tasksByDay.get(key) || 0,
        ai: aiByDay.get(key) || 0
      };
    });

    const revenueSeries = last7.map((d) => {
      const key = dateKey(d);
      return {
        day: formatDayLabel(d),
        revenue: salesByDay.get(key) || 0
      };
    });

    const memberByUserId = new Map(
      (members || []).filter((member) => member.user_id).map((member) => [member.user_id, member])
    );
    const taskSchedule = (allTasksData || []).slice(0, 4).map((task, index) => {
      const created = task.created_at ? new Date(task.created_at) : null;
      const assignee = task.assigned_to ? memberByUserId.get(task.assigned_to) : null;
      const hour = created
        ? created.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          })
        : `0${index + 9}:00`;

      return {
        id: task.id,
        time: hour,
        title: task.title,
        tag: task.status === "done" ? "Done" : "Todo",
        progress: task.status === "done" ? 100 : 45,
        due_date: task.due_date,
        assignee_name: assignee?.profile?.name || assignee?.invited_email || "Unassigned"
      };
    });

    const recentActivity = (activityLogsData || []).map((item) => ({
      id: item.id,
      text: item.description,
      created_at: item.created_at,
      relative_time: formatRelativeTime(item.created_at),
      action_type: item.action_type
    }));

    const stockStatus = (productsData || []).map((product) => {
      const stockValue = Number(product.stock) || 0;
      let status = "healthy";
      if (stockValue <= 25) status = "critical";
      else if (stockValue <= 50) status = "warning";
      return {
        id: product.id,
        name: product.name,
        level_pct: Math.max(0, Math.min(100, stockValue)),
        status,
        price: Number(product.price) || 0
      };
    });

    const transactions = (salesData || []).slice(0, 10).map((sale) => ({
      id: sale.id,
      order_id: `ORD-${sale.id}`,
      product: sale.product,
      price: Number(sale.price) || 0,
      customer: sale.customer,
      date: sale.date,
      payment_method: "Card"
    }));

    const productActivity = [
      {
        name: "In Stock",
        value: (productsData || []).filter((p) => Number(p.stock) > 50).length,
        color: "#38bdf8"
      },
      {
        name: "Warning",
        value: (productsData || []).filter((p) => {
          const stock = Number(p.stock) || 0;
          return stock > 25 && stock <= 50;
        }).length,
        color: "#fbbf24"
      },
      {
        name: "Critical",
        value: (productsData || []).filter((p) => (Number(p.stock) || 0) <= 25).length,
        color: "#ec4899"
      }
    ];

    const teamStats = {
      total_members: (members || []).filter((member) => member.status === "active").length,
      active_tasks: (allTasksData || []).filter((task) => task.status !== "done").length,
      completed_tasks: doneCount || 0,
      recent_activity_count: recentActivity.length
    };

    return res.status(200).json({
      user: context.user || fallbackUser(context.email),
      workspace: context.workspace,
      membership: context.membership,
      total_notes: notesCount || 0,
      completed_tasks: doneCount || 0,
      pending_tasks: pendingCount || 0,
      total_revenue: totalRevenue,
      total_products: productsCount || (productsData || []).length,
      ai_requests: (aiMessagesData || []).length,
      team_stats: teamStats,
      sales_overview: {
        total_revenue: totalRevenue,
        monthly_growth_pct: percentageChange(currentRevenue, previousRevenue),
        revenue_delta_pct: percentageChange(currentRevenue, previousRevenue),
        orders_delta_pct: percentageChange(currentOrders, previousOrders),
        completed_tasks_delta_pct: percentageChange(currentCompletedTasks, previousCompletedTasks),
        ai_requests_delta_pct: percentageChange(currentAiRequests, previousAiRequests),
        avg_order_value:
          transactions.length > 0 ? Math.round(totalRevenue / transactions.length) : 0,
        chart: revenueSeries.map((row) => row.revenue)
      },
      weekly_performance: weeklyPerformance,
      task_schedule: taskSchedule,
      recent_activity: recentActivity,
      top_products: topProducts,
      stock_status: stockStatus,
      transactions,
      sales_by_day: revenueSeries,
      product_activity: productActivity
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}
