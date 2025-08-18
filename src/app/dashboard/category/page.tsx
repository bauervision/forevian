"use client";
import React from "react";
import Link from "next/link";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { currentStatementMeta, type Period } from "@/lib/period";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";

function useStatementOptions() {
  return React.useMemo(() => {
    const idx = readIndex();
    const entries = Object.values(idx)
      .map((s: any) => ({
        id: s.id,
        label: s.label,
        year: s.stmtYear,
        month: s.stmtMonth,
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
    return entries;
  }, []);
}

function usePeriodRows(period: Period, liveRows: any[]) {
  const meta = currentStatementMeta();

  return React.useMemo(() => {
    if (!meta || period === "CURRENT") return liveRows;

    const idx = readIndex();
    const rules = readCatRules();
    const all: any[] = [];

    for (const s of Object.values(idx)) {
      if (!s) continue;
      if (s.stmtYear !== meta.year) continue;
      if (s.stmtMonth > meta.month) continue;
      if (Array.isArray(s.cachedTx)) {
        all.push(...s.cachedTx);
      } else {
        const curId = readCurrentId();
        if (curId && s.id === curId) all.push(...liveRows);
      }
    }
    const reapplied = applyCategoryRulesTo(rules, all, applyAlias);
    return reapplied as typeof liveRows;
  }, [period, liveRows, meta]);
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function CategoriesIndexPage() {
  const { transactions } = useReconcilerSelectors();
  const meta = currentStatementMeta();
  const options = useStatementOptions();
  const [selectedId, setSelectedId] = React.useState<string>(
    () => readCurrentId() || options[0]?.id || ""
  );
  const [period, setPeriod] = React.useState<Period>("CURRENT");

  const onSelectStatement = (id: string) => {
    writeCurrentId(id);
    setSelectedId(id);
  };

  const viewRows = usePeriodRows(period, transactions);

  const catTotals = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of viewRows) {
      const cat = (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
      // Show expense-positive totals for readability
      const amt = r.amount < 0 ? Math.abs(r.amount) : 0;
      m[cat] = (m[cat] ?? 0) + amt;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [viewRows]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Categories</h1>
        {meta && (
          <span className="text-xs px-2 py-1 rounded border bg-gray-50 dark:bg-gray-900">
            Viewing:{" "}
            {period === "CURRENT"
              ? meta.label
              : `YTD ${meta.year} (Jan–${meta.label.split(" ")[0]})`}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Statement selector */}
          <select
            className="border rounded px-2 py-1 bg-white dark:bg-white text-gray-700"
            value={selectedId}
            onChange={(e) => onSelectStatement(e.target.value)}
            title="Statement"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Period toggle */}
          <span className="text-sm">Period:</span>
          <div className="inline-flex rounded border overflow-hidden">
            <button
              className={`px-3 py-1 text-sm ${
                period === "CURRENT"
                  ? "bg-emerald-600 text-white"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              onClick={() => setPeriod("CURRENT")}
            >
              Current
            </button>
            <button
              className={`px-3 py-1 text-sm ${
                period === "YTD"
                  ? "bg-emerald-600 text-white"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              onClick={() => setPeriod("YTD")}
            >
              YTD
            </button>
          </div>
        </div>
      </div>

      <section className="rounded border p-4">
        {catTotals.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No transactions for this scope.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-2">Category</th>
                <th className="text-right p-2">Amount</th>
                <th className="p-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {catTotals.map(([cat, amt], i) => (
                <tr key={`${cat}-${i}`} className="border-t">
                  <td className="p-2">{cat}</td>
                  <td className="p-2 text-right">{money(amt)}</td>
                  <td className="p-2 text-right">
                    <Link
                      className="text-xs underline text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                      href={`/dashboard/category/${encodeURIComponent(
                        cat.toLowerCase().replace(/\s+/g, "-")
                      )}`}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
