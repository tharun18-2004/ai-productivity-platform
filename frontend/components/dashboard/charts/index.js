import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const chartGrid = { stroke: "#1f2a3b", strokeDasharray: "4 4" };
const axisTick = { fill: "#94a3b8", fontSize: 11 };

export function WeeklyPerformanceChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid {...chartGrid} />
        <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "#0b111a", border: "1px solid #1f2a3b", borderRadius: 10 }} />
        <Line type="monotone" dataKey="tasks" stroke="#a855f7" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="notes" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenueLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.55} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid {...chartGrid} />
        <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "#0b111a", border: "1px solid #1f2a3b", borderRadius: 10 }} />
        <Area type="monotone" dataKey="revenue" stroke="#60a5fa" fill="url(#revFill)" strokeWidth={2.8} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ProductDonutChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius={62} outerRadius={96} stroke="none">
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: "#0b111a", border: "1px solid #1f2a3b", borderRadius: 10 }} />
        <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CustomerBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid {...chartGrid} />
        <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "#0b111a", border: "1px solid #1f2a3b", borderRadius: 10 }} />
        <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
        <Bar dataKey="tasks" fill="#4f46e5" radius={[6, 6, 0, 0]} />
        <Bar dataKey="notes" fill="#22d3ee" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProductPopularityChart({ products }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={products} layout="vertical">
        <CartesianGrid {...chartGrid} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={axisTick} axisLine={false} tickLine={false} width={110} />
        <Tooltip contentStyle={{ background: "#0b111a", border: "1px solid #1f2a3b", borderRadius: 10 }} />
        <Bar dataKey="popularity" fill="#a855f7" radius={[0, 8, 8, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StockTrendChart({ stocks }) {
  const data = stocks.map((s, idx) => ({
    name: s.name.split(" ")[0],
    value: s.level_pct,
    baseline: Math.max(10, s.level_pct - 18 - idx * 2)
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid {...chartGrid} />
        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "#0b111a", border: "1px solid #1f2a3b", borderRadius: 10 }} />
        <Line type="monotone" dataKey="baseline" stroke="#64748b" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} dot={{ fill: "#22c55e", r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
