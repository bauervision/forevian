// /lib/period.ts
import { readIndex, readCurrentId, monthLabel } from "@/lib/statements";
import type { Transaction } from "@/app/providers/ReconcilerProvider";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";

export type Period = "CURRENT" | "YTD";

export function currentStatementMeta() {
  const idx = readIndex();
  const curId = readCurrentId() || Object.keys(idx)[0];
  const cur = curId ? idx[curId] : null;
  if (!cur) return null;
  return {
    id: curId!,
    year: cur.stmtYear,
    month: cur.stmtMonth,
    label: `${monthLabel(cur.stmtMonth)} ${cur.stmtYear}`,
  };
}

/**
 * Build rows for the selected period.
 * - CURRENT: use the live rows you pass in (usually provider.transactions).
 * - YTD: gather cachedTx for all statements in the same year up to the current statement month,
 *        then re-apply the latest alias+category rules to keep categorization fresh.
 */
export function rowsForPeriod(
  period: Period,
  currentLiveRows: Transaction[]
): Transaction[] {
  const meta = currentStatementMeta();
  if (!meta) return currentLiveRows;

  if (period === "CURRENT") {
    // Use what the Reconciler currently shows (already includes overrides & rules).
    return currentLiveRows;
  }

  // YTD: collect from cached statements
  const idx = readIndex();
  const rows: Transaction[] = [];
  for (const s of Object.values(idx)) {
    if (!s) continue;
    if (s.stmtYear !== meta.year) continue;
    // include months up to the current statement's month
    if (s.stmtMonth > meta.month) continue;
    if (Array.isArray(s.cachedTx)) rows.push(...(s.cachedTx as Transaction[]));
  }

  // Re-apply the LATEST alias + rules to keep things in sync across months.
  const rules = readCatRules();
  const reapplied = applyCategoryRulesTo(rules, rows, applyAlias);
  return reapplied as Transaction[];
}
