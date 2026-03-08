export function TransactionsTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#1a2233] text-slate-400">
            <th className="px-2 py-3">Order ID</th>
            <th className="px-2 py-3">Product</th>
            <th className="px-2 py-3">Price</th>
            <th className="px-2 py-3">Customer</th>
            <th className="px-2 py-3">Date</th>
            <th className="px-2 py-3">Payment Method</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[#131b2a] text-slate-200">
              <td className="px-2 py-3">{row.id}</td>
              <td className="px-2 py-3">{row.product}</td>
              <td className="px-2 py-3">{row.price}</td>
              <td className="px-2 py-3">{row.customer}</td>
              <td className="px-2 py-3">{row.date}</td>
              <td className="px-2 py-3">
                <span className="rounded bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200">{row.payment}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
