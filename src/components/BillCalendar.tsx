"use client";
import type { RecurringRow } from "@/lib/compute";

export function BillCalendar({ rows }: { rows: RecurringRow[] }) {
  if (!rows.length)
    return (
      <div className="text-sm opacity-70">No recurring items detected yet.</div>
    );
  return (
    <div className="divide-y divide-zinc-800">
      {rows.map((r, i) => (
        <div key={i} className="py-2 flex items-start gap-4">
          <div className="w-12 shrink-0 text-cyan-400 font-mono">
            {String(r.day).padStart(2, "0")}
          </div>
          <div className="flex-1 text-sm">
            <div
              className={
                r.type === "EXPENSE" ? "text-red-300" : "text-green-300"
              }
            >
              {r.type === "EXPENSE" ? "−" : "+"}${r.avgAmount.toFixed(2)} —{" "}
              {r.description}
            </div>
            <div className="opacity-70">{r.category}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
