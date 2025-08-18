"use client";
import React from "react";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { computeTotals } from "@/lib/metrics";
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

/** Build rows for the requested period. */
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

export default function DashboardPage() {
  const { transactions, inputs } = useReconcilerSelectors();
  const meta = currentStatementMeta();
  const options = useStatementOptions();
  const [selectedId, setSelectedId] = React.useState<string>(
    () => readCurrentId() || options[0]?.id || ""
  );
  const [period, setPeriod] = React.useState<Period>("CURRENT");

  // change current statement
  const onSelectStatement = (id: string) => {
    writeCurrentId(id);
    setSelectedId(id); // force re-render; meta reads from localStorage
  };

  const viewRows = usePeriodRows(period, transactions);
  const totals = React.useMemo(
    () => computeTotals(viewRows, inputs.beginningBalance ?? 0),
    [viewRows, inputs]
  );

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  // True Spend excludes Transfers, Debt, Cash Back
  const trueSpend = React.useMemo(() => {
    const EXCLUDE = new Set(["Transfers", "Debt", "Cash Back"]);
    return viewRows
      .filter((r) => r.amount < 0)
      .filter(
        (r) =>
          !EXCLUDE.has(
            (r.categoryOverride ?? r.category ?? "Uncategorized").trim()
          )
      )
      .reduce((s, r) => s + Math.abs(r.amount), 0);
  }, [viewRows]);

  const cashBack = React.useMemo(
    () =>
      viewRows
        .filter(
          (r) =>
            ((r.categoryOverride ?? r.category) || "").trim().toLowerCase() ===
            "cash back"
        )
        .reduce((s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0), 0),
    [viewRows]
  );

  const bySpender = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of viewRows) {
      if (r.amount >= 0) continue;
      const who =
        r.user === "Mike" || r.user === "Beth"
          ? r.user
          : r.cardLast4 === "5280"
          ? "Mike"
          : r.cardLast4 === "0161"
          ? "Beth"
          : "Unknown";
      map[who] = (map[who] ?? 0) + Math.abs(r.amount);
    }
    return map;
  }, [viewRows]);

  const topCats = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of viewRows) {
      if (r.amount >= 0) continue;
      const cat = (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
      m[cat] = (m[cat] ?? 0) + Math.abs(r.amount);
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [viewRows]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
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

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Income" value={money(totals.income)} />
        <Card label="Expenses" value={money(totals.expense)} />
        <Card label="Net" value={money(totals.income - totals.expense)} />
        <Card
          label="True Spend"
          value={money(trueSpend)}
          hint="Excludes Transfers, Debt, Cash Back"
        />
      </section>

      {/* Extras */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded border p-4">
          <h3 className="font-semibold mb-2">Cash Back</h3>
          <div className="text-2xl font-semibold">{money(cashBack)}</div>
        </div>

        <div className="rounded border p-4 lg:col-span-2">
          <h3 className="font-semibold mb-2">Spend by Spender</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-2">Person</th>
                <th className="text-right p-2">Spend</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySpender).map(([who, amt]) => (
                <tr key={who} className="border-t">
                  <td className="p-2">{who}</td>
                  <td className="p-2 text-right">{money(amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border p-4">
        <h3 className="font-semibold mb-2">Top Categories (Expenses)</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-2">Category</th>
              <th className="text-right p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {topCats.map(([cat, amt], i) => (
              <tr key={`${cat}-${i}`} className="border-t">
                <td className="p-2">{cat}</td>
                <td className="p-2 text-right">{money(amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded border p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}
