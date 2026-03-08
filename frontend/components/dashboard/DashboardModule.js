import { DashboardShell } from "./layout/DashboardShell";
import { useDashboardData } from "./layout/useDashboardData";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardHome } from "./pages/DashboardHome";
import { ProductsPage } from "./pages/ProductsPage";
import { SalesPage } from "./pages/SalesPage";
import { StockPage } from "./pages/StockPage";

export default function DashboardModule({ view = "dashboard" }) {
  const { overview, metrics, dashboardError, dashboardLoading } = useDashboardData();

  const title =
    view === "analytics"
      ? "Home / Dashboard / Analytics"
      : view === "sales"
        ? "Home / Dashboard / Sales Overview"
        : view === "products"
          ? "Home / Dashboard / Top Products"
          : view === "stock"
            ? "Home / Dashboard / Stock Status"
            : "Home / Dashboard";

  return (
    <DashboardShell activeKey={view} title={title} user={overview.user}>
      {dashboardLoading ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`dashboard-skeleton-${index}`}
                className="h-28 animate-pulse rounded-2xl border border-[#1a2233] bg-[#080d15]"
              />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl border border-[#1a2233] bg-[#080d15]" />
        </div>
      ) : null}
      {!dashboardLoading && view === "dashboard" && (
        <DashboardHome
          overview={overview}
          metrics={metrics}
          dashboardError={dashboardError}
        />
      )}
      {!dashboardLoading && view === "analytics" && <AnalyticsPage overview={overview} />}
      {!dashboardLoading && view === "sales" && <SalesPage overview={overview} />}
      {!dashboardLoading && view === "products" && <ProductsPage overview={overview} />}
      {!dashboardLoading && view === "stock" && <StockPage overview={overview} />}
    </DashboardShell>
  );
}
