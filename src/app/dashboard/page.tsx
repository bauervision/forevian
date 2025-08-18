"use client";
import React from "react";
import dynamic from "next/dynamic";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import {
  computeTotals,
  bucketizeSpecials,
  spendBySpender,
  recurringCandidates,
  type MinimalTx,
} from "@/lib/metrics";

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

// Lazy chart components (no SSR)
const { Pie, Bar } = {
  Pie: dynamic(
    async () => {
      const m = await import("react-chartjs-2");
      await import("chart.js/auto"); // registers scales/controllers
      return m.Pie;
    },
    { ssr: false }
  ),
  Bar: dynamic(
    async () => {
      const m = await import("react-chartjs-2");
      await import("chart.js/auto");
      return m.Bar;
    },
    { ssr: false }
  ),
};

export default function Dashboard() {
  const { transactions, inputs } = useReconcilerSelectors();

  // Tell metrics about overrides (if present)
  const rows = transactions as unknown as MinimalTx[];

  const t = computeTotals(rows, inputs.beginningBalance ?? 0);
  const specials = bucketizeSpecials(rows);
  const bySpender = spendBySpender(rows);
  const recur = recurringCandidates(rows);

  const topCats = Object.entries(t.byCategory)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8);

  const otherCatsTotal = Object.entries(t.byCategory)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(8)
    .reduce((s, [, v]) => s + v, 0);

  const pieLabels = [
    ...topCats.map(([c]) => c),
    ...(otherCatsTotal ? ["Other"] : []),
  ];
  const pieValues = [
    ...topCats.map(([, v]) => Math.abs(v)),
    ...(otherCatsTotal ? [Math.abs(otherCatsTotal)] : []),
  ];

  const barLabels = Object.keys(specials);
  const barValues = Object.values(specials);

  // Pass everything through; computeTotals relies on user/cardLast4
  const totals = React.useMemo(
    () => computeTotals(transactions, inputs.beginningBalance ?? 0),
    [transactions, inputs]
  );

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">Overview</h1>

      <section className="grid md:grid-cols-5 gap-4">
        <Card title="Income" value={money(t.income)} tone="ok" />
        <Card title="Expenses" value={money(t.expense)} tone="bad" />
        <Card
          title="Net"
          value={money(t.net)}
          tone={t.net >= 0 ? "ok" : "bad"}
        />
        <Card
          title="True Spend"
          value={money(t.trueSpend)}
          tone="warn"
          subtitle="excludes transfers & debt"
        />
        <Card title="Cash Back" value={money(t.cashBack)} tone="info" />
      </section>

      {/* Category pie + Specials bar */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded border p-4">
          <h3 className="font-semibold mb-3">Spend by Category</h3>
          <div className="h-80">
            {pieValues.length ? (
              <Pie
                data={{
                  labels: pieLabels,
                  datasets: [{ data: pieValues }],
                }}
              />
            ) : (
              <div className="text-sm text-gray-500">No data.</div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Top 8 categories shown; the rest grouped as “Other”. Uses manual
            overrides when present.
          </p>
        </div>

        <div className="rounded border p-4">
          <h3 className="font-semibold mb-3">
            Amazon • Subscriptions • Fast Food
          </h3>
          <div className="h-80">
            <Bar
              data={{
                labels: barLabels,
                datasets: [{ data: barValues }],
              }}
              options={{
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Only spending (negative amounts). “Fast Food” is detected by popular
            chain names.
          </p>
        </div>
      </section>

      {/* By Spender */}
      <section className="rounded border p-4">
        <h3 className="font-semibold mb-3">Spend by Spender</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-2">Person</th>
              <th className="text-right p-2">Spend</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(totals.bySpender).map(([who, amt]) => (
              <tr key={who} className="border-t">
                <td className="p-2">{who}</td>
                <td className="p-2 text-right">{money(amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Recurring bills */}
      <section className="rounded border p-4">
        <h3 className="font-semibold mb-2">Likely Recurring Bills</h3>
        {recur.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-2">Bill</th>
                <th className="text-right p-2">Avg Amount</th>
                <th className="text-right p-2">Count</th>
                <th className="text-right p-2">Draft Day</th>
              </tr>
            </thead>
            <tbody>
              {recur.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right">{money(r.avg)}</td>
                  <td className="p-2 text-right">{r.count}</td>
                  <td className="p-2 text-right">{r.draftDay ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-500">
            No recurring candidates detected yet.
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Heuristic based on Subscriptions/Housing/Utilities/Insurance/Debt and
          most common posting day.
        </p>
      </section>
    </div>
  );
}

function Card({
  title,
  value,
  tone,
  subtitle,
}: {
  title: string;
  value: string;
  tone: "ok" | "bad" | "warn" | "info";
  subtitle?: string;
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20"
      : tone === "bad"
      ? "border-red-300 bg-red-50 dark:bg-red-900/20"
      : tone === "warn"
      ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20"
      : "border-sky-300 bg-sky-50 dark:bg-sky-900/20";
  return (
    <div className={`rounded border p-4 ${styles}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs opacity-70">{subtitle}</div>}
    </div>
  );
}
