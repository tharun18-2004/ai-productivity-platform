import { MetricCard, SurfaceCard } from "../ui/cards";
import { TransactionsTable } from "../ui/table";
import { formatINR } from "../../../lib/currency";

export function SalesPage({ overview }) {
  const commerceUnavailable = overview.commerce_available === false;
  const metrics = {
    revenue: overview.sales_overview?.total_revenue || 0,
    orders: overview.transactions?.length || 0,
    completed: overview.completed_tasks || 0,
    ai: overview.ai_requests || 0,
    revenueDelta: overview.sales_overview?.revenue_delta_pct ?? null,
    ordersDelta: overview.sales_overview?.orders_delta_pct ?? null,
    completedDelta: overview.sales_overview?.completed_tasks_delta_pct ?? null,
    aiDelta: overview.sales_overview?.ai_requests_delta_pct ?? null
  };

  const rows = (overview.transactions || []).map((row) => ({
    id: row.order_id || row.id,
    product: row.product,
    price: formatINR(row.price || 0),
    customer: row.customer,
    date: row.date
      ? new Date(row.date).toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        })
      : "",
    payment: row.payment_method || "Card"
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Revenue"
          value={formatINR(metrics.revenue)}
          delta={metrics.revenueDelta}
        />
        <MetricCard
          label="Total Orders"
          value={`${metrics.orders}`}
          delta={metrics.ordersDelta}
          accent="text-cyan-300"
        />
        <MetricCard
          label="Completed Tasks"
          value={`${metrics.completed}`}
          delta={metrics.completedDelta}
          accent="text-indigo-300"
        />
        <MetricCard
          label="AI Requests"
          value={`${metrics.ai}`}
          delta={metrics.aiDelta}
          accent="text-violet-300"
        />
      </div>
      <SurfaceCard title="Recent Transactions">
        {commerceUnavailable ? (
          <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] px-4 py-6 text-sm text-slate-400">
            Commerce metrics are unavailable for this workspace because the current sales tables are
            not scoped by workspace.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] px-4 py-6 text-sm text-slate-400">
            No sales or orders found yet. Add your own sales data to see revenue, customer names, and order history here.
          </div>
        ) : (
          <TransactionsTable rows={rows} />
        )}
      </SurfaceCard>
    </div>
  );
}
