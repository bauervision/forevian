"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export function SafeToInvestChart({
  data,
}: {
  data: { day: number; balance: number }[];
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fill: "#ccc" }} />
          <YAxis tick={{ fill: "#ccc" }} />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333" }}
          />
          <Line type="monotone" dataKey="balance" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
