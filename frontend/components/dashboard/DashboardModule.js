import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { DashboardShell } from "./layout/DashboardShell";
import { useDashboardData } from "./layout/useDashboardData";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardHome } from "./pages/DashboardHome";
import { ProductsPage } from "./pages/ProductsPage";
import { SalesPage } from "./pages/SalesPage";
import { StockPage } from "./pages/StockPage";
import { supabase } from "../../lib/supabaseClient";

export default function DashboardModule({ view = "dashboard" }) {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedError, setSeedError] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const { overview, metrics, dashboardError, dashboardLoading } = useDashboardData(authenticated);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));

      if (!active) return;

      if (session?.user) {
        setAuthenticated(true);
        setAuthLoading(false);
        return;
      }

      setAuthenticated(false);
      setAuthLoading(false);
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
    };

    checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      const isAuthenticated = Boolean(session?.user);
      setAuthenticated(isAuthenticated);
      setAuthLoading(false);

      if (!isAuthenticated) {
        router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

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

  const seedSales = async () => {
    setSeedMessage("");
    setSeedError("");
    setSeedLoading(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      const response = await fetch("/api/dashboard/seed-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email || "" })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Could not add demo sales.");
      }
      setSeedMessage("Added demo sales. Refreshing metrics...");
      window.dispatchEvent(new Event("dashboard-refresh"));
    } catch (err) {
      setSeedError(err?.message || "Could not add demo sales.");
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <DashboardShell activeKey={view} title={title} user={overview.user}>
      {authLoading || dashboardLoading ? (
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
      {!authLoading && authenticated && !dashboardLoading && view === "dashboard" && (
        <DashboardHome
          overview={overview}
          metrics={metrics}
          dashboardError={dashboardError}
          seedLoading={seedLoading}
          seedError={seedError}
          seedMessage={seedMessage}
          onSeedSales={seedSales}
        />
      )}
      {!authLoading && authenticated && !dashboardLoading && view === "analytics" && (
        <AnalyticsPage overview={overview} />
      )}
      {!authLoading && authenticated && !dashboardLoading && view === "sales" && (
        <SalesPage overview={overview} />
      )}
      {!authLoading && authenticated && !dashboardLoading && view === "products" && (
        <ProductsPage overview={overview} />
      )}
      {!authLoading && authenticated && !dashboardLoading && view === "stock" && (
        <StockPage overview={overview} />
      )}
    </DashboardShell>
  );
}
