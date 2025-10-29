// components/BurnRateDialog.tsx
"use client";

import * as React from "react";
import {
  // types + helpers
  type Tx,
  catOf,
  txKey,
  // persistence (per Spender + Statement + Period)
  readBurnExclusions,
  writeBurnExclusions,
  readBurnExcludedCats,
  writeBurnExcludedCats,
  // filtering that respects base True-Spend exclusions PLUS user category exclusions
  isBurnEligibleWithCats,
  isIncomeCategory,
} from "@/lib/burn-utils";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => USD.format(n);
const norm = (s: string) => s.trim().toLowerCase();

export default function BurnRateDialog({
  open,
  onClose,
  spender,
  statementId,
  period, // "CURRENT" | "YTD"
  periodDays,
  candidateRows, // rows already scoped to this spender
  onPrefsChanged, // OPTIONAL: tell parent to recompute (pill updates instantly)
}: {
  open: boolean;
  onClose: () => void;
  spender: string;
  statementId: string;
  period: "CURRENT" | "YTD";
  periodDays: number;
  candidateRows: Tx[];
  onPrefsChanged?: () => void;
}) {
  // persisted sets
  const [excludedTx, setExcludedTx] = React.useState<Set<string>>(new Set());
  const [excludedCats, setExcludedCats] = React.useState<Set<string>>(
    new Set()
  );

  // load on open / key changes
  React.useEffect(() => {
    if (!open || !statementId) return;
    setExcludedTx(readBurnExclusions(spender, statementId, period));
    setExcludedCats(readBurnExcludedCats(spender, statementId, period));
  }, [open, spender, statementId, period]);

  // present categories (from all candidate rows, for selector list & totals)
  const presentCats = React.useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>();
    for (const r of candidateRows) {
      if (r.amount >= 0) continue; // only expenses matter for burn
      const c = catOf(r);
      if (isIncomeCategory(c)) continue; // hide income-like categories entirely
      const k = c.trim().toLowerCase();
      const prev = m.get(k) || { name: c, total: 0, count: 0 };
      prev.total += Math.abs(r.amount);
      prev.count += 1;
      m.set(k, prev);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [candidateRows]);

  const schedulePrefsChanged = React.useCallback(() => {
    if (!onPrefsChanged) return;
    // choose one of the defers below; setTimeout(0) is the most compatible
    // queueMicrotask(onPrefsChanged);
    setTimeout(onPrefsChanged, 0);
    // or React.startTransition(() => onPrefsChanged());
  }, [onPrefsChanged]);

  // toggle one transaction
  const toggleTx = React.useCallback(
    (k: string) => {
      setExcludedTx((prev) => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        writeBurnExclusions(spender, statementId, period, next);
        return next;
      });
      schedulePrefsChanged(); // <-- defer parent refresh
    },
    [spender, statementId, period, schedulePrefsChanged]
  );

  // toggle one category (normalized key)
  const toggleCat = React.useCallback(
    (catNorm: string) => {
      setExcludedCats((prev) => {
        const next = new Set(prev);
        next.has(catNorm) ? next.delete(catNorm) : next.add(catNorm);
        writeBurnExcludedCats(spender, statementId, period, next);
        return next;
      });
      schedulePrefsChanged(); // <-- defer parent refresh
    },
    [spender, statementId, period, schedulePrefsChanged]
  );

  // effective rows that count toward burn
  const effectiveRows = React.useMemo(() => {
    return candidateRows
      .filter((r) => isBurnEligibleWithCats(r, excludedCats))
      .filter((r) => !excludedTx.has(txKey(r)));
  }, [candidateRows, excludedCats, excludedTx]);

  const burnTotal = React.useMemo(
    () => effectiveRows.reduce((s, r) => s + Math.abs(r.amount), 0),
    [effectiveRows]
  );
  const burnRate = periodDays ? burnTotal / periodDays : 0;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-start justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Daily Burn — {spender}</div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Summary */}
        <div className="text-sm text-slate-300/90 mb-3">
          {money(burnTotal)} counted over {periodDays} days →{" "}
          <span className="font-semibold">{money(burnRate)}/day</span>
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          {/* Category selector */}
          <div className="md:col-span-2">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
              Exclude Categories
            </div>
            <div className="rounded-xl border border-slate-800 max-h-[60vh] overflow-auto divide-y divide-slate-800">
              {presentCats.length === 0 && (
                <div className="p-3 text-sm text-slate-400">
                  No categories in scope.
                </div>
              )}
              {presentCats.map(({ name, total, count }) => {
                const k = norm(name);
                const checked = !excludedCats.has(k);
                return (
                  <label key={k} className="flex items-center gap-2 p-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCat(k)}
                      title={checked ? "Exclude category" : "Include category"}
                    />
                    <span className="truncate">{name}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {count} · {money(total)}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Uncheck a category to remove all of its transactions from burn.
            </div>
          </div>

          {/* Transaction table */}
          <div className="md:col-span-3">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
              Transactions
            </div>

            <div className="rounded-xl border border-slate-800 max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 p-2 w-10 bg-slate-950"></th>
                    <th className="sticky top-0 z-10 text-left p-2 w-24 bg-slate-950">
                      Date
                    </th>
                    <th className="sticky top-0 z-10 text-left p-2 bg-slate-950">
                      Description
                    </th>
                    <th className="sticky top-0 z-10 text-right p-2 w-28 bg-slate-950">
                      Amount
                    </th>
                    <th className="sticky top-0 z-10 text-left p-2 w-40 bg-slate-950">
                      Category
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidateRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-3 text-slate-400">
                        No transactions in scope.
                      </td>
                    </tr>
                  )}
                  {candidateRows
                    .filter((r) => r.amount < 0 && !isIncomeCategory(catOf(r)))
                    .map((r, i) => {
                      const k = txKey(r);
                      const excludedByCat = !isBurnEligibleWithCats(
                        r,
                        excludedCats
                      ); // category made it ineligible
                      const excludedByTx = excludedTx.has(k); // user unchecked the row
                      const off = excludedByCat || excludedByTx;

                      return (
                        <tr
                          key={`${r.id || "row"}-${i}`}
                          className={`border-t border-slate-800 ${
                            off ? "opacity-50" : ""
                          }`}
                          title={
                            excludedByCat
                              ? "Excluded by category"
                              : excludedByTx
                              ? "Excluded by transaction"
                              : "Included in burn"
                          }
                        >
                          <td className="p-2 align-top">
                            <input
                              type="checkbox"
                              // show the **effective** inclusion state
                              checked={!off}
                              // don’t allow toggling when category is excluding it
                              disabled={excludedByCat}
                              onChange={() => {
                                if (excludedByCat) return; // guard
                                toggleTx(k);
                              }}
                            />
                          </td>
                          <td className="p-2 align-top">{r.date || ""}</td>
                          <td className="p-2 align-top">
                            {(r.description || "").trim()}
                          </td>
                          <td className="p-2 text-right align-top">
                            {money(Math.abs(r.amount))}
                          </td>
                          <td className="p-2 align-top">
                            {catOf(r)}
                            {excludedByCat && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Category
                              </span>
                            )}
                            {!excludedByCat && excludedByTx && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
                                Tx
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Uncheck any items you don’t want counted toward Daily Burn.
              Category toggles also apply.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
