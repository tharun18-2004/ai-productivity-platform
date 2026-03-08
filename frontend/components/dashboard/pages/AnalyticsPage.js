import { CustomerBarChart, ProductDonutChart, RevenueLineChart } from "../charts";
import { SurfaceCard } from "../ui/cards";

export function AnalyticsPage({ overview }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SurfaceCard title="Revenue Line Chart" className="xl:col-span-2">
        <RevenueLineChart data={overview.sales_by_day || []} />
      </SurfaceCard>
      <SurfaceCard title="Product Activity Donut Chart">
        <ProductDonutChart data={overview.product_activity || []} />
      </SurfaceCard>
      <SurfaceCard title="Customer Activity Bar Chart" className="xl:col-span-3">
        <CustomerBarChart data={overview.weekly_productivity} />
      </SurfaceCard>
    </div>
  );
}
