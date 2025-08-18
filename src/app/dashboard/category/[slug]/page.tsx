"use client";
import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { currentStatementMeta, type Period } from "@/lib/period";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { prettyDesc, stripAuthAndCard } from "@/lib/txEnrich";

type PeriodEx = Period; // 'CURRENT' | 'YTD'

function unslug(s: string) {
  try {
    return decodeURIComponent(String(s)).replace(/-/g, " ");
  } catch {
    return String(s).replace(/-/g, " ");
  }
}
const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

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

/** Build period rows just like dashboard. */
function useScopedRows(period: PeriodEx, liveRows: any[]) {
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

export default function CategoryDetailPage() {
  const params = useParams<{ slug: string }>();
  const catName = unslug(params.slug || "").trim();

  const meta = currentStatementMeta();
  const options = useStatementOptions();
  const [selectedId, setSelectedId] = React.useState<string>(
    () => readCurrentId() || options[0]?.id || ""
  );
  const [period, setPeriod] = React.useState<PeriodEx>("CURRENT");

  const { transactions } = useReconcilerSelectors();
  const onSelectStatement = (id: string) => {
    writeCurrentId(id);
    setSelectedId(id);
  };

  const viewRows = useScopedRows(period, transactions);

  const rows = React.useMemo(() => {
    return viewRows.filter((r) => {
      const cat = (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
      return cat.toLowerCase() === catName.toLowerCase();
    });
  }, [viewRows, catName]);

  const byMerchant = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const label =
        applyAlias(r.description || "") ||
        r.merchant ||
        // fallback: CLEAN display text (not the raw)
        prettyDesc(r.description || "");
      const amt = Math.abs(r.amount < 0 ? r.amount : 0);
      m[label] = (m[label] ?? 0) + amt;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const total = rows.reduce(
    (s, r) => s + Math.abs(r.amount < 0 ? r.amount : 0),
    0
  );

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{catName}</h1>
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

          {/* Scope */}
          <span className="text-sm">Scope:</span>
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

      {/* Totals */}
      <section className="rounded border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Total spend
            </div>
            <div className="text-2xl font-semibold">{money(total)}</div>
          </div>
          <Link
            href="/dashboard"
            className="text-sm underline text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </section>

      {/* Merchant rollup */}
      <section className="rounded border p-4">
        <h3 className="font-semibold mb-2">By Merchant</h3>
        {byMerchant.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No transactions in this scope.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-2">Merchant</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {byMerchant.map(([m, amt], i) => (
                <tr key={`${m}-${i}`} className="border-t">
                  <td className="p-2">{m}</td>
                  <td className="p-2 text-right">{money(amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Raw transactions */}
      <section className="rounded border p-4">
        <h3 className="font-semibold mb-2">Transactions</h3>
        {rows.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No transactions.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">User</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.id || "row"}-${i}`} className="border-t">
                  <td className="p-2">{r.date || ""}</td>
                  <td className="p-2">{prettyDesc(r.description)}</td>
                  <td className="p-2">
                    {r.user ||
                      (r.cardLast4 === "5280"
                        ? "Mike"
                        : r.cardLast4 === "0161"
                        ? "Beth"
                        : "Unknown")}
                  </td>
                  <td className="p-2 text-right">
                    {money(Math.abs(r.amount))}
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
