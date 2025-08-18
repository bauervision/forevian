"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export function CategoryChart({
  data,
}: {
  data: { category: string; amount: number }[];
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="category"
            interval={0}
            tick={{ fill: "#ccc", fontSize: 12 }}
            angle={-20}
            textAnchor="end"
          />
          <YAxis tick={{ fill: "#ccc" }} />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333" }}
          />
          <Bar dataKey="amount" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
