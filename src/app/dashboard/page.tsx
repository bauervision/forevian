"use client";
import React from "react";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { computeTotals } from "@/lib/metrics";
import { currentStatementMeta, type Period } from "@/lib/period";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import StatementSwitcher from "@/components/StatementSwitcher";
import ResponsiveShell from "@/components/ResponsiveShell";
import { useSearchParams } from "next/navigation";

/* ---------------------------- helpers & hooks ---------------------------- */

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

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

/* --------------------------------- page ---------------------------------- */

export default function DashboardPage() {
  const { transactions, inputs } = useReconcilerSelectors();
  const options = useStatementOptions();

  // URL ↔ localStorage sync for statement
  const searchParams = useSearchParams();
  const urlStatement = searchParams.get("statement") ?? "";
  React.useEffect(() => {
    if (!urlStatement) return;
    if (readCurrentId() !== urlStatement) writeCurrentId(urlStatement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatement]);

  const meta = currentStatementMeta();
  const [period, setPeriod] = React.useState<Period>("CURRENT");

  const viewRows = usePeriodRows(period, transactions);
  const totals = React.useMemo(
    () => computeTotals(viewRows, inputs.beginningBalance ?? 0),
    [viewRows, inputs]
  );

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
    <ResponsiveShell
      title="Dashboard"
      right={<StatementSwitcher available={options.map((o) => o.id)} />}
    >
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Header row (no duplicate title) */}
        <div className="flex flex-wrap items-center gap-3">
          {meta && (
            <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
              Viewing:{" "}
              {period === "CURRENT"
                ? meta.label
                : `YTD ${meta.year} (Jan–${meta.label.split(" ")[0]})`}
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm">Period:</span>
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
              <button
                className={`px-3 py-1 text-sm ${
                  period === "CURRENT"
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-slate-900"
                }`}
                onClick={() => setPeriod("CURRENT")}
              >
                Current
              </button>
              <button
                className={`px-3 py-1 text-sm ${
                  period === "YTD"
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-slate-900"
                }`}
                onClick={() => setPeriod("YTD")}
              >
                YTD
              </button>
            </div>
          </div>
        </div>

        {/* Top KPI row: Deposits | Net | True Spend | Cash Back */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Deposits"
            value={money(totals.income)}
            accent="green"
          />
          {/* Keeping your original net math to avoid changing semantics */}
          <KpiCard
            label="Net"
            value={money(totals.income - totals.expense)}
            accent={totals.income - totals.expense >= 0 ? "green" : "red"}
          />
          <KpiCard
            label="True Spend"
            value={money(trueSpend)}
            accent="red"
            hint="Excludes Transfers, Debt, Cash Back"
          />
          <KpiCard label="Cash Back" value={money(cashBack)} accent="green" />
        </section>

        {/* Second row: Expenses (moved here) + Spend by Spender */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <KpiCard
            label="Expenses"
            value={money(totals.expense)}
            accent="red"
          />

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 lg:col-span-2 overflow-x-auto">
            <h3 className="font-semibold mb-2">Spend by Spender</h3>
            <table className="w-full text-sm min-w-[420px]">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="text-left p-2">Person</th>
                  <th className="text-right p-2">Spend</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bySpender).map(([who, amt]) => (
                  <tr key={who} className="border-t border-slate-800">
                    <td className="p-2">{who}</td>
                    <td className="p-2 text-right">{money(amt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top categories */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 overflow-x-auto">
          <h3 className="font-semibold mb-2">Top Categories (Expenses)</h3>
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="text-left p-2">Category</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {topCats.map(([cat, amt], i) => (
                <tr key={`${cat}-${i}`} className="border-t border-slate-800">
                  <td className="p-2">{cat}</td>
                  <td className="p-2 text-right">{money(amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </ResponsiveShell>
  );
}

/* ------------------------------ UI elements ------------------------------ */

function KpiCard({
  label,
  value,
  hint,
  accent = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "green" | "red" | "neutral";
}) {
  const accentClass =
    accent === "green"
      ? "border-emerald-500"
      : accent === "red"
      ? "border-rose-500"
      : "border-slate-700";

  return (
    <div
      className={`rounded-2xl border ${accentClass} border-l-4 bg-slate-900 p-4`}
    >
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-xl sm:text-2xl font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
