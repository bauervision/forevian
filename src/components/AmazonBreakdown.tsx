"use client";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export function AmazonBreakdown({
  total,
  parts,
}: {
  total: number;
  parts: { name: string; value: number }[];
}) {
  if (total <= 0)
    return <div className="text-sm opacity-70">No Amazon spend in range.</div>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={parts}
            dataKey="value"
            nameKey="name"
            outerRadius={85}
            label
          />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333" }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-xs opacity-70 mt-1">
        Total Amazon: ${total.toFixed(2)}
      </div>
    </div>
  );
}
