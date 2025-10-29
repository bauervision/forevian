import { Summary } from "@/lib/summaries";
import { TxRow } from "@/lib/types";

// NEW: Build a compact monthly Summary from current tx + inputs
export function summarizeMonth(
  monthId: string,
  txs: TxRow[],
  inputs: {
    beginningBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  }
): Summary {
  const deposits = txs.filter((t) => (t.amount ?? 0) > 0);
  const withdrawals = txs.filter((t) => (t.amount ?? 0) < 0);

  const depositsTotal = +deposits
    .reduce((s, r) => s + (r.amount ?? 0), 0)
    .toFixed(2);
  const withdrawalsAbs = +withdrawals
    .reduce((s, r) => s + Math.abs(r.amount ?? 0), 0)
    .toFixed(2);

  // Prefer live-calculated totals; fall back to inputs if needed
  const d = depositsTotal || +(inputs.totalDeposits ?? 0);
  const w = withdrawalsAbs || +(inputs.totalWithdrawals ?? 0);

  const begin = +(inputs.beginningBalance ?? 0);
  const endingBalance = +(begin + d - w).toFixed(2);

  // Spend by category (withdrawals only)
  const spendByCategory: Record<string, number> = {};
  for (const t of withdrawals) {
    const label = (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
    const amt = Math.abs(t.amount ?? 0);
    spendByCategory[label] = +((spendByCategory[label] ?? 0) + amt).toFixed(2);
  }

  return {
    monthId,
    currency: "USD",
    totals: { deposits: d, withdrawals: w, endingBalance },
    spendByCategory,
    source: "reconciled",
  };
}
