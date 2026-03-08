import dynamic from "next/dynamic";

const DashboardModule = dynamic(() => import("../../components/dashboard/DashboardModule"), {
  ssr: false,
  loading: () => <main className="min-h-screen bg-[#070b12]" />
});

export default function DashboardPage() {
  return <DashboardModule view="dashboard" />;
}
