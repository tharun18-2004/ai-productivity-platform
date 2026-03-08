export const dashboardNav = [
  { label: "Home", href: "/dashboard", key: "home" },
  { label: "Dashboard", href: "/dashboard", key: "dashboard" },
  { label: "Analytics", href: "/dashboard/analytics", key: "analytics" },
  { label: "Sales Overview", href: "/dashboard/sales", key: "sales" },
  { label: "Top Products", href: "/dashboard/products", key: "products" },
  { label: "Stock Status", href: "/dashboard/stock", key: "stock" },
  { label: "Notes", href: "/notes", key: "notes" },
  { label: "Tasks", href: "/tasks", key: "tasks" },
  { label: "AI Tools", href: "/ai", key: "ai" },
  { label: "Settings", href: "/settings", key: "settings" }
];

export const fallbackOverview = {
  user: { name: "User", email: "user@example.com" },
  total_notes: 0,
  completed_tasks: 0,
  pending_tasks: 0,
  ai_requests: 0,
  sales_overview: {
    total_revenue: 0,
    monthly_growth_pct: 0,
    avg_order_value: 0,
    chart: [0, 0, 0, 0, 0, 0, 0]
  },
  weekly_productivity: [
    { day: "Mon", notes: 0, tasks: 0, ai: 0 },
    { day: "Tue", notes: 0, tasks: 0, ai: 0 },
    { day: "Wed", notes: 0, tasks: 0, ai: 0 },
    { day: "Thu", notes: 0, tasks: 0, ai: 0 },
    { day: "Fri", notes: 0, tasks: 0, ai: 0 },
    { day: "Sat", notes: 0, tasks: 0, ai: 0 },
    { day: "Sun", notes: 0, tasks: 0, ai: 0 }
  ],
  top_products: [],
  stock_status: [
    { id: 1, name: "Starter Credits", status: "healthy", level_pct: 0 },
    { id: 2, name: "AI Tokens", status: "warning", level_pct: 0 },
    { id: 3, name: "Export Minutes", status: "critical", level_pct: 0 },
    { id: 4, name: "Storage Quota", status: "healthy", level_pct: 0 }
  ],
  task_schedule: [],
  recent_activity: [],
  transactions: [],
  sales_by_day: [
    { day: "Mon", revenue: 0 },
    { day: "Tue", revenue: 0 },
    { day: "Wed", revenue: 0 },
    { day: "Thu", revenue: 0 },
    { day: "Fri", revenue: 0 },
    { day: "Sat", revenue: 0 },
    { day: "Sun", revenue: 0 }
  ],
  product_activity: [
    { name: "In Stock", value: 0, color: "#38bdf8" },
    { name: "Warning", value: 0, color: "#fbbf24" },
    { name: "Critical", value: 0, color: "#ec4899" }
  ]
};
