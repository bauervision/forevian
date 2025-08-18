// /lib/trends.ts
import { readIndex, monthLabel } from "./statements";
import type { Transaction } from "@/app/providers/ReconcilerProvider";

export type MonthKey = string; // 'YYYY-MM'

export function keyOf(y: number, m: number): MonthKey {
  return `${y}-${String(m).padStart(2, "0")}`;
}
export function prettyMonth(key: MonthKey) {
  const [y, mm] = key.split("-").map(Number);
  return `${monthLabel(mm)} ${y}`;
}

export type MonthlySeries = {
  key: MonthKey; // '2025-05'
  label: string; // 'May 2025'
  rows: Transaction[]; // cached rows
  byCategory: Record<string, number>; // net by category (income positive, expenses negative)
  spendByCategory: Record<string, number>; // expenses only (positive)
  incomeByCategory: Record<string, number>; // income only
};

export function buildMonthlyFromStatements(): MonthlySeries[] {
  const idx = readIndex();
  const out: MonthlySeries[] = [];

  for (const id of Object.keys(idx).sort()) {
    const s = idx[id];
    const rows: Transaction[] = Array.isArray(s?.cachedTx) ? s.cachedTx : [];
    const key = keyOf(s.stmtYear, s.stmtMonth);
    const label = `${monthLabel(s.stmtMonth)} ${s.stmtYear}`;

    const byCategory: Record<string, number> = {};
    const spendByCategory: Record<string, number> = {};
    const incomeByCategory: Record<string, number> = {};

    for (const r of rows) {
      const cat = (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
      const amt = Number(r.amount) || 0;
      byCategory[cat] = (byCategory[cat] ?? 0) + amt;
      if (amt < 0)
        spendByCategory[cat] = (spendByCategory[cat] ?? 0) + Math.abs(amt);
      if (amt > 0) incomeByCategory[cat] = (incomeByCategory[cat] ?? 0) + amt;
    }

    out.push({
      key,
      label,
      rows,
      byCategory,
      spendByCategory,
      incomeByCategory,
    });
  }
  return out;
}

// build a number series for selected categories (expenses)
export function seriesForCategories(
  months: MonthlySeries[],
  cats: string[]
): { x: MonthKey[]; y: number[]; label: string }[] {
  const x = months.map((m) => m.key);
  return cats.map((cat) => {
    const y = months.map((m) => m.spendByCategory[cat] ?? 0);
    return { x, y, label: cat };
  });
}

// simple helpers
export const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function lastDelta(y: number[]) {
  if (y.length < 2) return { prev: 0, last: 0, delta: 0, pct: 0 };
  const last = y[y.length - 1];
  const prev = y[y.length - 2];
  const delta = last - prev;
  const pct = prev !== 0 ? (delta / prev) * 100 : 0;
  return { prev, last, delta, pct };
}

export function rollingAvg(y: number[], k = 3) {
  if (!y.length) return 0;
  const take = y.slice(-k);
  const s = take.reduce((a, b) => a + b, 0);
  return s / take.length;
}
