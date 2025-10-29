"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import StatementSwitcher from "@/components/StatementSwitcher";
import { readIndex, readCurrentId, writeCurrentId } from "@/lib/statements";
import {
  buildRowsForStatement,
  buildRowsYTD,
  type RawRow,
} from "@/lib/tx/normalizedRows";
import ExpensesReport from "@/components/finance/ExpenseReport";

type Period = "CURRENT" | "YTD";

/* utils */
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => moneyFmt.format(n);
const toInput = (d: Date | null) =>
  d
    ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10)
    : "";
const fromInput = (s: string) => {
  const d = new Date(s);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
};
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const monthRangeOf = (y: number, m1: number) => ({
  start: new Date(y, m1 - 1, 1, 0, 0, 0, 0),
  end: new Date(y, m1, 0, 23, 59, 59, 999),
});

export default function ExpensesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  // 1) All hooks declared unconditionally (stable order)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const idx = useMemo(() => readIndex(), []);
  const [effectiveId, setEffectiveId] = useState<string>(() => {
    const saved = readCurrentId();
    if (saved && idx[saved]) return saved;
    const sorted = Object.values(idx).sort(
      (a: any, b: any) => b.stmtYear - a.stmtYear || b.stmtMonth - a.stmtMonth
    );
    const withData = sorted.filter(
      (s: any) =>
        (Array.isArray(s?.cachedTx) && s.cachedTx.length > 0) ||
        (Array.isArray(s?.pagesRaw) && s.pagesRaw.length > 0)
    );
    return withData[0]?.id || sorted[0]?.id || "";
  });

  const [period, setPeriod] = useState<Period>("CURRENT");
  const meta = effectiveId ? (idx as any)[effectiveId] : null;

  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);

  // 2) Snap date range when statement/period changes (runs after mount)
  useEffect(() => {
    if (!meta) {
      setFrom(null);
      setTo(null);
      return;
    }
    if (period === "CURRENT") {
      const { start, end } = monthRangeOf(meta.stmtYear, meta.stmtMonth);
      setFrom(start);
      setTo(end);
    } else {
      const start = new Date(meta.stmtYear, 0, 1, 0, 0, 0, 0);
      const end = new Date(meta.stmtYear, meta.stmtMonth, 0, 23, 59, 59, 999);
      setFrom(start);
      setTo(end);
    }
  }, [effectiveId, period, meta]);

  // 3) Normalized rows (same pipeline as Categories)
  const allRows: RawRow[] = useMemo(() => {
    if (!effectiveId) return [];
    return period === "CURRENT"
      ? buildRowsForStatement(effectiveId)
      : buildRowsYTD(effectiveId);
  }, [effectiveId, period]);

  // 4) Expense-only base set
  const baseTxs = useMemo(() => {
    const toTx = (r: RawRow) => ({
      id: r.id,
      date: r.date || "",
      amount: Number(r.amount ?? 0),
      category: (r.categoryOverride ?? r.category ?? "Uncategorized").trim(),
      merchant: r.description || "",
      note: r.description || "",
      account: r.cardLast4 ? `Card ••${r.cardLast4}` : undefined,
    });
    return allRows
      .map(toTx)
      .filter((t) => t.amount < 0)
      .filter(
        (t) =>
          !/^(transfer(?::|$)|refund|reimbursement)/i.test(
            t.category || "Uncategorized"
          )
      );
  }, [allRows]);

  // 5) Category chips
  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const t of baseTxs) s.add(t.category || "Uncategorized");
    return Array.from(s).sort();
  }, [baseTxs]);

  const [cats, setCats] = useState<string[]>([]);
  const toggleCat = (c: string) =>
    setCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const clearCats = () => setCats([]);

  // 6) Filter by date + cats
  function parseDateLoose(s?: string): Date | null {
    if (!s) return null;

    // Try ISO first
    const iso = Date.parse(s);
    if (!Number.isNaN(iso)) return new Date(iso);

    // Try MM/DD[/YYYY] or YYYY-MM-DD
    const mdy = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (mdy) {
      const mm = +mdy[1];
      const dd = +mdy[2];
      const yy = mdy[3] ? +mdy[3] : NaN;
      const yyyy = Number.isNaN(yy)
        ? new Date().getFullYear()
        : yy < 100
        ? 2000 + yy
        : yy;
      // noon to dodge DST edge cases
      return new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
    }

    return null;
  }

  const txsFiltered = useMemo(() => {
    const byCats =
      cats.length === 0
        ? baseTxs
        : baseTxs.filter((t) => cats.includes(t.category || "Uncategorized"));

    if (!from || !to) return byCats;

    return byCats.filter((t) => {
      const d = parseDateLoose(t.date);
      if (!d) return true; // <-- Do NOT drop rows with unparseable dates
      return d >= from && d <= to;
    });
  }, [baseTxs, cats, from, to]);

  const grandTotal = useMemo(
    () => txsFiltered.reduce((s, t) => s + Math.abs(t.amount), 0),
    [txsFiltered]
  );

  // 7) Render — no early return; we show a lightweight shell until `mounted`, `meta`, `from/to` are ready
  const loading =
    !mounted || !effectiveId || !meta || from === null || to === null;

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Expenses</h1>

          {meta && (
            <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
              Viewing:{" "}
              {period === "CURRENT"
                ? meta.label
                : `YTD ${meta.stmtYear} (Jan–${meta.label.split(" ")[0]})`}
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              Statement
            </span>
            <StatementSwitcher
              // @ts-ignore
              value={effectiveId}
              onChange={(id: string) => {
                setEffectiveId(id);
                writeCurrentId(id);
                if (!isDemo && typeof window !== "undefined") {
                  const u = new URL(window.location.href);
                  u.searchParams.set("statement", id);
                  router.replace(u.pathname + "?" + u.searchParams.toString());
                }
              }}
              available={Object.values(idx)
                .map((s: any) => s.id)
                .sort()}
              showLabel={false}
              size="sm"
              className="w-44 sm:w-56"
            />

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

        {/* Filters */}
        <div className="hide-on-print flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">From</div>
            <input
              type="date"
              value={toInput(from)}
              onChange={(e) => setFrom(fromInput(e.target.value))}
              className="border rounded px-2 py-1 bg-slate-950 border-slate-700"
              disabled={loading}
            />
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">To</div>
            <input
              type="date"
              value={toInput(to)}
              onChange={(e) => setTo(endOfDay(fromInput(e.target.value)))}
              className="border rounded px-2 py-1 bg-slate-950 border-slate-700"
              disabled={loading}
            />
          </div>
          <div className="flex-1" />
          <div className="text-sm text-slate-400">
            {loading ? "…" : `${txsFiltered.length} expense tx`}
          </div>
        </div>

        {/* Category chips */}
        <div className="hide-on-print flex flex-wrap gap-2 items-center">
          {categories.map((c) => {
            const active = cats.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={[
                  "px-2.5 py-1 rounded-full border text-sm",
                  active
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "hover:bg-slate-900 border-slate-700 text-slate-200",
                ].join(" ")}
                disabled={loading}
              >
                {c}
              </button>
            );
          })}
          {cats.length > 0 && (
            <button
              onClick={clearCats}
              className="ml-1 text-sm underline text-slate-400"
              disabled={loading}
            >
              Clear
            </button>
          )}
        </div>

        {/* Grand total */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Grand Total (filtered)
          </div>
          <div className="text-2xl font-semibold">
            {loading ? "…" : money(grandTotal)}
          </div>
        </div>

        {/* Report + PDF */}
        <ExpensesReport
          title="Expenses Report"
          transactions={loading ? [] : txsFiltered}
          from={from ?? new Date()}
          to={to ?? new Date()}
        />
      </div>
    </ProtectedRoute>
  );
}
