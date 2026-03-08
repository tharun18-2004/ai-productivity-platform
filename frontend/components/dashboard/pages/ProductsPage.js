import { ProductPopularityChart } from "../charts";
import { SurfaceCard } from "../ui/cards";
import { formatINR } from "../../../lib/currency";

export function ProductsPage({ overview }) {
  const products = overview.top_products || [];
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SurfaceCard title="Top Selling Products">
        <div className="space-y-3">
          {products.length === 0 ? (
            <div className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3 text-sm text-slate-400">
              No product sales found yet.
            </div>
          ) : null}
          {products.map((p, idx) => (
            <div key={p.id} className="rounded-xl border border-[#1a2233] bg-[#0a1018] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white">
                  #{idx + 1} {p.name}
                </p>
                <p className="text-xs text-slate-400">{p.sales} sales</p>
              </div>
              <p className="mt-1 text-sm text-slate-300">Revenue: {formatINR(p.revenue)}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>
      <SurfaceCard title="Product Popularity">
        <ProductPopularityChart products={products} />
      </SurfaceCard>
    </div>
  );
}
