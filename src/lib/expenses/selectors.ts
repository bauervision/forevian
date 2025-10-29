// /lib/expenses/selectors.ts
export type Tx = {
  id: string;
  date: string; // ISO
  amount: number; // negative for expense, positive for income
  category: string; // e.g., "Dining", "Gas", "Entertainment"
  merchant?: string;
  account?: string;
  note?: string;
};

export function isExpense(t: Tx) {
  return t.amount < 0; // negative = money out
}

export function inRange(t: Tx, from: Date, to: Date) {
  const d = new Date(t.date).getTime();
  return d >= from.getTime() && d <= to.getTime();
}

export function fmtCurrency(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
}

export function rollupByCategory(txs: Tx[]) {
  const map = new Map<string, { total: number; items: Tx[] }>();
  for (const t of txs) {
    const key = t.category || "Uncategorized";
    if (!map.has(key)) map.set(key, { total: 0, items: [] });
    const o = map.get(key)!;
    o.total += t.amount;
    o.items.push(t);
  }
  // Sort categories by absolute spend desc
  return Array.from(map.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => (Math.abs(a.total) > Math.abs(b.total) ? -1 : 1));
}
