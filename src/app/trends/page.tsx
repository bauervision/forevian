"use client";
import React from "react";
import {
  buildMonthlyFromStatements,
  seriesForCategories,
  money,
  lastDelta,
  rollingAvg,
  prettyMonth,
} from "@/lib/trends";
import { Sparkline } from "@/components/Sparkline";

const DEFAULT_CATS = ["Utilities", "Fast Food", "Dining"];

export default function TrendsPage() {
  const months = React.useMemo(() => buildMonthlyFromStatements(), []);
  const [cats, setCats] = React.useState<string[]>(() => {
    // preselect common ones that you mentioned
    const set = new Set(
      DEFAULT_CATS.filter((c) =>
        months.some((m) => (m.spendByCategory[c] ?? 0) > 0)
      )
    );
    // if empty, pick the top-3 expense categories from the last month
    if (!set.size && months.length) {
      const last = months[months.length - 1];
      const entries = Object.entries(last.spendByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);
      entries.forEach((c) => set.add(c));
    }
    return Array.from(set);
  });

  const allCatsSorted = React.useMemo(() => {
    const seen = new Set<string>();
    for (const m of months)
      for (const c of Object.keys(m.spendByCategory)) seen.add(c);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [months]);

  const series = React.useMemo(
    () => seriesForCategories(months, cats),
    [months, cats]
  );
  const x = months.map((m) => m.key);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Trends</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {months.length} month{months.length === 1 ? "" : "s"}
        </span>
      </header>

      {/* Category picker */}
      <section className="rounded border p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold">Categories</h3>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Select up to ~6 for quick view
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCatsSorted.map((c) => {
            const active = cats.includes(c);
            return (
              <button
                key={c}
                className={`px-3 py-1 rounded border text-sm ${
                  active
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                onClick={() =>
                  setCats((prev) =>
                    active ? prev.filter((x) => x !== c) : [...prev, c]
                  )
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      {/* Cards per category */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {series.map((s) => {
          const { last, prev, delta, pct } = lastDelta(s.y);
          const avg3 = rollingAvg(s.y, 3);
          const up = delta > 0;
          const lastMonthLabel = months.length
            ? prettyMonth(x[x.length - 1])
            : "";
          const prevMonthLabel =
            months.length > 1 ? prettyMonth(x[x.length - 2]) : "";
          return (
            <div
              key={s.label}
              className="rounded border p-4 flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="font-semibold">{s.label}</h4>
                <div className="text-right">
                  <div className="text-lg">{money(last)}</div>
                  <div
                    className={`text-xs ${
                      up ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {up ? "▲" : "▼"} {money(Math.abs(delta))} ({pct.toFixed(1)}
                    %) vs {prevMonthLabel || "prior"}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Sparkline values={s.y} ariaLabel={`${s.label} trend`} />
                <div className="text-xs text-right">
                  <div>3-mo avg</div>
                  <div className="font-medium">{money(avg3)}</div>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Latest: {lastMonthLabel}. Range:{" "}
                {months.length ? prettyMonth(x[0]) : ""} → {lastMonthLabel}
              </div>
            </div>
          );
        })}
      </section>

      {/* Utilities focus */}
      <section className="rounded border p-4">
        <h3 className="font-semibold mb-2">Utilities over time</h3>
        {(() => {
          const u = seriesForCategories(months, ["Utilities"])[0] || {
            y: [],
            x: [] as string[],
            label: "Utilities",
          };
          const avg3 = rollingAvg(u.y, 3);
          return (
            <div className="flex items-center justify-between gap-3">
              <Sparkline values={u.y} ariaLabel="Utilities trend" />
              <div className="text-sm">
                <div>
                  3-mo avg: <span className="font-medium">{money(avg3)}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Weather overlay coming soon (cooling/heating degree days)
                </div>
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
