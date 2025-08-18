import type { Tx } from "@/lib/types";
import {
  canonicalCategory,
  canonicalMerchant,
  detectSpender,
  recurrenceKey,
  extractCashBack,
} from "@/lib/normalize";

export type RecurringRow = {
  description: string;
  day: number;
  avgAmount: number;
  type: "INCOME" | "EXPENSE";
  category: string;
};

type Spender = "All" | "Mike" | "Beth";

type ViewTx = Tx & {
  _cat: string;
  _merchant?: string;
  _spender: "Mike" | "Beth" | "Unknown";
  _dir: "INCOME" | "EXPENSE";
  _rkey: string;
  _day: number;
  _cashback: number; // detected from description
};

function viewTx(t: Tx): ViewTx {
  const desc = t.description || "";
  const cat = canonicalCategory(desc, t.category);
  const merch = canonicalMerchant(desc) || t.merchant || undefined;
  const spender = detectSpender(desc, t.cardLast4) || t.spender || "Unknown";
  const dir: "INCOME" | "EXPENSE" = t.amount >= 0 ? "INCOME" : "EXPENSE";
  const rkey = recurrenceKey(desc);
  const day = t.postDay || new Date(t.date).getDate();
  const cb = extractCashBack(desc); // e.g., “cash back $50.00”
  return {
    ...t,
    _cat: cat,
    _merchant: merch,
    _spender: spender,
    _dir: dir,
    _rkey: rkey,
    _day: day,
    _cashback: cb,
  };
}

export function filterBySpender(txs: Tx[], who: Spender): Tx[] {
  if (who === "All") return txs;
  return txs.filter((t) => viewTx(t)._spender === who);
}

// Sum EXPENSE as positive dollars for charting, with cash-back split to Cash
export function spendingByCategory(txs: Tx[]) {
  const map = new Map<string, number>();
  for (const t0 of txs) {
    const t = viewTx(t0);
    if (t.amount >= 0) continue;

    const gross = Math.abs(t.amount);
    const cb = Math.min(Math.max(t._cashback, 0), gross); // clamp
    const purchase = +(gross - cb).toFixed(2);

    if (purchase > 0) map.set(t._cat, (map.get(t._cat) || 0) + purchase);
    if (cb > 0) map.set("Cash", (map.get("Cash") || 0) + cb);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount: +amount.toFixed(2) }))
    .sort((a, b) => b.amount - a.amount);
}

export function amazonBreakdown(txs: Tx[]) {
  const total = txs
    .map(viewTx)
    .filter((t) => t._cat === "Amazon" && t.amount < 0)
    .reduce((s, t) => {
      const gross = Math.abs(t.amount);
      const cb = Math.min(Math.max(t._cashback, 0), gross);
      return s + (gross - cb); // Amazon purchase portion only
    }, 0);

  const ratios = { Gifts: 0.1724, Groceries: 0.6897, Supplements: 0.1379 };
  return {
    total: +total.toFixed(2),
    parts: [
      { name: "Gifts", value: +(total * ratios.Gifts).toFixed(2) },
      { name: "Groceries", value: +(total * ratios.Groceries).toFixed(2) },
      { name: "Supplements", value: +(total * ratios.Supplements).toFixed(2) },
    ],
  };
}

export function buildRecurringCalendar(txs: Tx[]): RecurringRow[] {
  interface RecAcc {
    days: number[];
    amts: number[];
    months: Set<string>;
    dir: "INCOME" | "EXPENSE";
    cat: string;
    label: string;
  }

  const monthKey = (iso: string) => iso.slice(0, 7);
  const by = new Map<string, RecAcc>();

  const ALLOW_RECUR_CATS = new Set([
    "Housing",
    "Utilities",
    "Insurance",
    "Subscriptions",
    "Debt",
    "Transfers",
    "Kids/School",
  ]);

  const isCreditCardPayment = (label: string) =>
    /credit\s*card\s*payment|epay|online\s*pmt/i.test(label) ||
    /(Chase|Capital One)\b.*(Payment|EPAY)/i.test(label);

  const looksLikeCardSwipe = (desc: string) => /Card\s*\d{4}/i.test(desc);

  for (const t0 of txs) {
    const t = viewTx(t0);
    const key = t._rkey;

    let rec = by.get(key);
    if (!rec) {
      rec = {
        days: [],
        amts: [],
        months: new Set<string>(),
        dir: t._dir,
        cat: t._cat,
        label: t._merchant || t.description,
      };
      by.set(key, rec);
    }
    if (!ALLOW_RECUR_CATS.has(t._cat)) continue;
    if (t._cashback && t._cashback > 0) continue; // <- blocks retail cash-back
    if (/Card\s*\d{4}/i.test(t.description)) continue; // <- block card swipes from “recurring”
    if (
      /credit\s*card\s*payment|epay/i.test(t.description) ||
      /(Chase|Capital One).*(Payment|EPAY)/i.test(t.description)
    )
      continue; // block CC bill pays
    // inside the loop, before pushing into the accumulator:
    if (
      t._dir === "EXPENSE" &&
      (isCreditCardPayment(t._merchant || t.description) ||
        looksLikeCardSwipe(t.description))
    ) {
      continue; // skip card swipes and CC payments from "Recurring Bill Calendar"
    }
    // For recurrence, use the total amount (not the split) to keep the typical bill size
    rec.days.push(t._day);
    rec.amts.push(Math.abs(t.amount));
    rec.months.add(monthKey(t.date));
    rec.dir = t._dir;
    rec.cat = t._cat;
    rec.label = t._merchant || rec.label;
  }

  const rows: RecurringRow[] = [];
  for (const [, r] of by) {
    if (r.months.size < 2) continue;
    const avgAmount = r.amts.reduce((a, b) => a + b, 0) / r.amts.length;
    const avgDay = Math.round(
      r.days.reduce((a, b) => a + b, 0) / r.days.length
    );
    rows.push({
      description: r.label,
      day: avgDay,
      avgAmount: +avgAmount.toFixed(2),
      type: r.dir,
      category: r.cat,
    });
  }

  rows.sort(
    (a, b) => a.day - b.day || a.description.localeCompare(b.description)
  );
  return rows;
}

export function forecastTypicalMonth(recurring: RecurringRow[]) {
  const deposits = new Map<number, number>();
  const bills = new Map<number, number>();
  for (const r of recurring) {
    const m = r.type === "INCOME" ? deposits : bills;
    m.set(r.day, (m.get(r.day) || 0) + r.avgAmount);
  }
  const out: { day: number; balance: number }[] = [];
  let bal = 0;
  for (let d = 1; d <= 31; d++) {
    bal += (deposits.get(d) || 0) - (bills.get(d) || 0);
    out.push({ day: d, balance: +bal.toFixed(2) });
  }
  return out;
}
