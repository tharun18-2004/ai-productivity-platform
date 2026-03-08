const express = require("express");
const store = require("../data/store");

const router = express.Router();

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatKey = (date) => {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

router.get("/overview", (req, res) => {
  const userId = Number(req.query.user_id || 1);
  const notes = store.notes.filter((n) => n.user_id === userId);
  const tasks = store.tasks.filter((t) => t.user_id === userId);
  const aiRequests = store.ai_requests.filter((r) => r.user_id === userId);
  const user = store.users.find((u) => u.id === userId) || store.users[0] || null;

  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const pendingTasks = tasks.filter((t) => t.status !== "done").length;

  const sevenDays = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    sevenDays.push(d);
  }

  const productivity = sevenDays.map((day) => {
    const key = formatKey(day);
    const notesCount = notes.filter((n) => formatKey(n.created_at) === key).length;
    const tasksCount = tasks.filter((t) => formatKey(t.created_at) === key).length;
    const aiCount = aiRequests.filter((r) => formatKey(r.created_at) === key).length;
    return {
      day: day.toLocaleDateString("en-US", { weekday: "short" }),
      notes: notesCount,
      tasks: tasksCount,
      ai: aiCount
    };
  });

  const recentActivity = [
    ...notes.map((n) => ({
      type: "note",
      title: `Edited note: ${n.title}`,
      created_at: n.created_at
    })),
    ...tasks.map((t) => ({
      type: "task",
      title: `Task ${t.status}: ${t.title}`,
      created_at: t.created_at
    })),
    ...aiRequests.map((r) => ({
      type: "ai",
      title: `AI used for ${r.task}`,
      created_at: r.created_at
    }))
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  const salesOverview = {
    total_revenue: 92576,
    monthly_growth_pct: 12.4,
    avg_order_value: 87.3,
    chart: [38, 44, 52, 48, 61, 67, 72]
  };

  const topProducts = [
    { id: 1, name: "Pro Plan", sales: 184, revenue: 18400 },
    { id: 2, name: "AI Add-on", sales: 142, revenue: 12780 },
    { id: 3, name: "Team Seats", sales: 98, revenue: 9800 },
    { id: 4, name: "Consulting Pack", sales: 37, revenue: 7400 }
  ];

  const stockStatus = [
    { id: 1, name: "Starter Credits", status: "healthy", level_pct: 82 },
    { id: 2, name: "AI Tokens", status: "warning", level_pct: 46 },
    { id: 3, name: "Export Minutes", status: "critical", level_pct: 21 },
    { id: 4, name: "Storage Quota", status: "healthy", level_pct: 74 }
  ];

  return res.json({
    overview: {
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
      total_notes: notes.length,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      ai_requests: aiRequests.length,
      weekly_productivity: productivity,
      recent_activity: recentActivity,
      sales_overview: salesOverview,
      top_products: topProducts,
      stock_status: stockStatus
    }
  });
});

module.exports = router;
