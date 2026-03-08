import { StockTrendChart } from "../charts";
import { ProgressBar, SurfaceCard } from "../ui/cards";

export function StockPage({ overview }) {
  const stocks = overview.stock_status || [];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SurfaceCard title="System Resource Usage">
        <div className="space-y-4">
          {stocks.length === 0 ? (
            <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3 text-sm text-slate-400">
              No product stock data found yet.
            </div>
          ) : null}
          {stocks.map((stock) => (
            <ProgressBar key={stock.id} label={stock.name} value={stock.level_pct} status={stock.status} />
          ))}
        </div>
      </SurfaceCard>
      <SurfaceCard title="Stock Health Trend">
        <StockTrendChart stocks={stocks} />
      </SurfaceCard>
    </div>
  );
}
