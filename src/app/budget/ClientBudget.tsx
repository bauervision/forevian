"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DEMO_MONTHS } from "@/app/demo/data";
import { readIndex } from "@/lib/statements";
import {
  readCatRules,
  applyCategoryRulesTo,
  upsertCategoryRules,
  candidateKeys,
} from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { writeOverride, keyForTx } from "@/lib/overrides";
import { useCategories } from "@/app/providers/CategoriesProvider";
import { usePathname } from "next/navigation";
import DemoBudgetTips from "@/components/DemoBudgetTips";

/* ------------------------------------------------------------------ */
/* Types & utils                                                      */
/* ------------------------------------------------------------------ */

type TxRow = {
  id: string;
  date?: string;
  description?: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
};

type TxLike = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
  cardLast4?: string;
  user?: string;
};

function weeksOfMonth(year: number, month0: number, weekStartsOn: 0 | 1 = 0) {
  // month0 is 0-based. Returns array of { start: Date, end: Date, inMonthDays: number }
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  // find the start of the first week (back to Sun/Mon)
  const shift = (first.getDay() - weekStartsOn + 7) % 7;
  const firstWeekStart = new Date(first);
  firstWeekStart.setDate(first.getDate() - shift);

  const weeks: { start: Date; end: Date; inMonthDays: number }[] = [];
  let curStart = new Date(firstWeekStart);
  while (curStart <= last || weeks.length === 0) {
    const curEnd = new Date(curStart);
    curEnd.setDate(curStart.getDate() + 6);

    // Count how many days of this week are inside the target month
    let inMonthDays = 0;
    for (let d = 0; d < 7; d++) {
      const probe = new Date(curStart);
      probe.setDate(curStart.getDate() + d);
      if (probe.getMonth() === month0 && probe.getFullYear() === year)
        inMonthDays++;
    }

    weeks.push({
      start: new Date(curStart),
      end: new Date(curEnd),
      inMonthDays,
    });
    curStart = new Date(curStart);
    curStart.setDate(curStart.getDate() + 7);

    // stop once we passed the last-of-month and we started after it
    if (curStart > last && curStart.getMonth() !== month0) break;
  }
  return weeks;
}

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => fmtUSD.format(n);

function normalizeDateToDay(s?: string): number | null {
  if (!s) return null;
  const m =
    s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/) ||
    s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/);
  if (m) {
    const dd = Number(m[m.length - 1]);
    if (dd >= 1 && dd <= 31) return dd;
  }
  const dd = Number(s.slice(-2));
  return dd >= 1 && dd <= 31 ? dd : null;
}

function pretty(desc?: string) {
  const s = (desc || "").replace(/\s+/g, " ").trim();
  return s.replace(/^purchase authorized on\s*\d{1,2}[\/\-]\d{1,2}\s*/i, "");
}

/** Heuristic for mandatory bills (tightened so Fuel/Gas stations don't match) */
function isMandatoryCategory(catRaw: string, desc?: string) {
  const c = (catRaw || "").toLowerCase();
  const d = (desc || "").toLowerCase();

  if (/(^|\s)(rent|mortgage)($|\s)/.test(c)) return true;
  if (/(^|\s)insurance($|\s)/.test(c)) return true;
  if (/(^|\s)(debt|loan|credit\s*card)($|\s)/.test(c)) return true;
  if (/subscription|subscriptions|stream/.test(c)) return true;
  if (/membership|memberships/.test(c)) return true;

  // Utilities (no bare "gas")
  if (/utilities|utility|power|water|internet/.test(c)) return true;
  if (/(natural\s*gas|gas\s*utility|utility:\s*gas|gas\s*\(utility\))/.test(c))
    return true;

  const utilityVendors = [
    "dominion",
    "national grid",
    "nicor",
    "centerpoint",
    "peoples gas",
    "con ed",
    "consolidated edison",
    "pg&e",
    "pge",
    "duke energy",
    "xfinity",
    "comcast",
    "spectrum",
    "verizon fios",
    "at&t fiber",
    "fios",
    "cox communications",
  ];
  if (utilityVendors.some((v) => d.includes(v))) return true;

  return false;
}

/** slider persistence */
function usePersistedNumber(key: string, initial: number) {
  const [val, setVal] = React.useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const n = Number(raw);
      return Number.isFinite(n) ? n : initial;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(key, String(val));
    } catch {}
  }, [key, val]);
  return [val, setVal] as const;
}

function ensureTxLike(r: any): TxLike {
  return {
    id: r.id,
    date: (r.date ?? "").toString(),
    description: (r.description ?? "").toString().trim(),
    amount: Number(r.amount ?? 0),
    category: r.category ?? undefined,
    categoryOverride: r.categoryOverride ?? undefined,
    cardLast4: r.cardLast4,
    user: r.user,
  };
}

/* -------------------------- Category Select ---------------------------- */

const CATEGORY_ADD_SENTINEL = "__ADD__";

function CategorySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { categories } = useCategories() as any;
  const CategoryManagerDialog =
    require("@/components/CategoryManagerDialog").default;
  const [openMgr, setOpenMgr] = React.useState(false);

  const sorted = React.useMemo(() => {
    const set: Set<string> = new Set(
      (categories || []).map((c: string) => c.trim()).filter(Boolean)
    );
    if (value && !set.has(value)) set.add(value);
    const list = Array.from(set) as string[];
    list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const i = list.findIndex((x) => x.toLowerCase() === "uncategorized");
    if (i >= 0) {
      const [u] = list.splice(i, 1);
      list.push(u === "Uncategorized" ? u : "Uncategorized");
    }
    return list;
  }, [categories, value]);

  return (
    <>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CATEGORY_ADD_SENTINEL) {
            setOpenMgr(true);
            return;
          }
          onChange(v);
        }}
        className="bg-slate-900 text-slate-100 border border-slate-700 rounded-xl px-2 py-1"
      >
        {sorted.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={CATEGORY_ADD_SENTINEL}>＋ Edit Categories…</option>
      </select>

      <CategoryManagerDialog open={openMgr} onClose={() => setOpenMgr(false)} />
    </>
  );
}

/* --------------------- Savings/Investing helpers ---------------------- */

function isSavingsCategory(cat?: string) {
  const c = (cat || "").toLowerCase();
  return c === "transfer:savings" || /savings/.test(c);
}
function isInvestingCategory(cat?: string) {
  const c = (cat || "").toLowerCase();
  return (
    c === "transfer:investing" ||
    /invest(ing)?|broker(age)?|401k|roth|ira/.test(c)
  );
}
const SAVINGS_HINTS = ["ally", "marcus", "discover savings", "capital one 360"];
const INVEST_HINTS = [
  "robinhood",
  "fidelity",
  "vanguard",
  "schwab",
  "m1 finance",
  "etrade",
  "webull",
];
function looksLikeSavings(desc?: string) {
  const d = (desc || "").toLowerCase();
  return SAVINGS_HINTS.some((h) => d.includes(h));
}
function looksLikeInvesting(desc?: string) {
  const d = (desc || "").toLowerCase();
  return INVEST_HINTS.some((h) => d.includes(h));
}

/* ------------------------------------------------------------------ */
/* Statement selection: last issued statement with data                */
/* ------------------------------------------------------------------ */

function useLatestIssuedWithData(): {
  label?: string;
  month?: number;
  year?: number;
  rows: TxRow[];
} {
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  return React.useMemo(() => {
    // 1) Load statements index (real data)
    const idx = readIndex();
    let source = Object.values(idx) as Array<{
      id: string;
      label: string;
      stmtYear: number;
      stmtMonth: number; // 1-12
      cachedTx?: any[];
    }>;

    // 2) Demo fallback — if no statements exist yet on /demo, use DEMO_MONTHS
    if ((!source || source.length === 0) && isDemo) {
      source = DEMO_MONTHS.map((m) => ({
        id: m.id,
        label: m.label,
        stmtYear: m.stmtYear,
        stmtMonth: m.stmtMonth,
        cachedTx: m.cachedTx ?? [],
      }));
    }

    if (!source || source.length === 0) {
      return { rows: [] };
    }

    // 3) Pick the most recent *issued* month (previous month), else most recent with rows
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastY = last.getFullYear();
    const lastM = last.getMonth() + 1;

    const sorted = [...source].sort(
      (a, b) => b.stmtYear - a.stmtYear || b.stmtMonth - a.stmtMonth
    );
    const hasRows = (s: any) =>
      Array.isArray(s?.cachedTx) && s.cachedTx.length > 0;

    const picked =
      sorted.find(
        (s) =>
          (s.stmtYear < lastY ||
            (s.stmtYear === lastY && s.stmtMonth <= lastM)) &&
          hasRows(s)
      ) || sorted.find(hasRows);

    if (!picked) return { rows: [] };

    // 4) Apply category rules/aliases to normalize rows
    const rules = readCatRules();
    const prepared: TxLike[] = Array.isArray(picked.cachedTx)
      ? picked.cachedTx.map(ensureTxLike)
      : [];
    const applied = applyCategoryRulesTo(
      rules,
      prepared,
      applyAlias
    ) as TxLike[];

    const rows: TxRow[] = applied.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amount: r.amount,
      category: r.category,
      categoryOverride: r.categoryOverride,
      cardLast4: r.cardLast4,
      user: r.user,
    }));

    return {
      label: picked.label,
      month: picked.stmtMonth,
      year: picked.stmtYear,
      rows,
    };
  }, [isDemo, pathname]);
}

/* ------------------------------------------------------------------ */
/* Groceries  */
/* ------------------------------------------------------------------ */

function isGroceriesCategory(cat?: string) {
  const c = (cat || "").toLowerCase();
  return /grocer|supermarket/.test(c) || c === "groceries";
}
const GROCERY_HINTS = [
  "kroger",
  "heb",
  "walmart",
  "target",
  "costco",
  "sam's club",
  "safeway",
  "publix",
  "meijer",
  "wegmans",
  "trader joe",
  "trader joe's",
  "aldi",
  "whole foods",
  "food lion",
  "giant",
  "stop & shop",
  "vons",
  "harris teeter",
];
function looksLikeGroceries(desc?: string) {
  const d = (desc || "").toLowerCase();
  return GROCERY_HINTS.some((h) => d.includes(h));
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ClientBudgetPage() {
  const { label: stmtLabel, rows } = useLatestIssuedWithData();

  // Which month are we showing? 0 = this month, 1 = next month
  const [viewOffset, setViewOffset] = React.useState<0 | 1>(0);

  // Utility: get first day of the "view" month
  const viewFirst = React.useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + viewOffset, 1);
  }, [viewOffset]);

  // Convenience flags
  const isForecast = viewOffset === 1;

  // Make sure tracking cats exist (once)
  const { categories = [], setCategories } = useCategories() as any;
  React.useEffect(() => {
    const need = ["Transfer:Savings", "Transfer:Investing"];
    const lower = new Set(categories.map((c: string) => c.toLowerCase()));
    const missing = need.filter((n) => !lower.has(n.toLowerCase()));
    if (missing.length && typeof setCategories === "function") {
      setCategories([...categories, ...missing]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deposits = React.useMemo(
    () => rows.filter((r) => (r.amount ?? 0) > 0),
    [rows]
  );
  const withdrawals = React.useMemo(
    () => rows.filter((r) => (r.amount ?? 0) < 0),
    [rows]
  );

  const totalIncome = React.useMemo(
    () => +deposits.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2),
    [deposits]
  );

  /* ---------- Local include/exclude overrides for bill calendar ---------- */
  const BILL_OVR_KEY = "ui.budget.billOverrides";
  const [billOverrides, setBillOverrides] = React.useState<
    Record<string, boolean>
  >(() => {
    try {
      const raw = localStorage.getItem(BILL_OVR_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(BILL_OVR_KEY, JSON.stringify(billOverrides));
    } catch {}
  }, [billOverrides]);

  /* -------------------- Bills (from withdrawals) -------------------- */
  const bills = React.useMemo(() => {
    const list = withdrawals
      .map((w) => {
        const cat = (
          w.categoryOverride ??
          w.category ??
          "Uncategorized"
        ).trim();
        const day = normalizeDateToDay(w.date);
        const includeByOverride = billOverrides[w.id];
        const inferred = isMandatoryCategory(cat, w.description);
        const include =
          includeByOverride === true
            ? true
            : includeByOverride === false
            ? false
            : inferred;
        if (!include) return null;
        return {
          id: w.id,
          dateStr: w.date,
          day,
          description: pretty(w.description),
          category: cat,
          amountAbs: Math.abs(w.amount ?? 0),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      dateStr?: string;
      day: number | null;
      description: string;
      category: string;
      amountAbs: number;
    }>;

    // Collapse duplicates (same day + label) to a single total
    const keyFor = (x: (typeof list)[number]) =>
      `${x.day ?? "?"}::${x.category}::${x.description}`;
    const m = new Map<string, (typeof list)[number]>();
    for (const b of list) {
      const k = keyFor(b);
      if (!m.has(k)) m.set(k, { ...b });
      else {
        const prev = m.get(k)!;
        prev.amountAbs += b.amountAbs;
      }
    }
    return Array.from(m.values()).sort((a, b) => (a.day ?? 99) - (b.day ?? 99));
  }, [withdrawals, billOverrides]);

  const totalBills = React.useMemo(
    () => +bills.reduce((s, b) => s + b.amountAbs, 0).toFixed(2),
    [bills]
  );

  /* ----------------- Sliders + monthly targets --------------------- */
  const [savePct, setSavePct] = usePersistedNumber("ui.budget.savePct", 10);
  const [investPct, setInvestPct] = usePersistedNumber(
    "ui.budget.investPct",
    10
  );

  const [groPct, setGroPct] = usePersistedNumber("ui.budget.groPct", 10);

  const groceriesAmt = Math.max(0, Math.round((totalIncome * groPct) / 100));

  const savingsAmt = Math.max(0, Math.round((totalIncome * savePct) / 100));
  const investingAmt = Math.max(0, Math.round((totalIncome * investPct) / 100));

  /* --------------- Actuals vs targets (tracking) ------------------- */
  const actualSavings = React.useMemo(
    () =>
      +withdrawals
        .filter(
          (w) =>
            isSavingsCategory(w.categoryOverride ?? w.category) ||
            looksLikeSavings(w.description)
        )
        .reduce((s, w) => s + Math.abs(w.amount ?? 0), 0)
        .toFixed(2),
    [withdrawals]
  );

  const actualInvesting = React.useMemo(
    () =>
      +withdrawals
        .filter(
          (w) =>
            isInvestingCategory(w.categoryOverride ?? w.category) ||
            looksLikeInvesting(w.description)
        )
        .reduce((s, w) => s + Math.abs(w.amount ?? 0), 0)
        .toFixed(2),
    [withdrawals]
  );

  const actualGroceries = React.useMemo(
    () =>
      +withdrawals
        .filter(
          (w) =>
            isGroceriesCategory(w.categoryOverride ?? w.category) ||
            looksLikeGroceries(w.description)
        )
        .reduce((s, w) => s + Math.abs(w.amount ?? 0), 0)
        .toFixed(2),
    [withdrawals]
  );

  const groPctHit = groceriesAmt
    ? Math.min(100, Math.round((actualGroceries / groceriesAmt) * 100))
    : 0;
  const groRemaining = Math.max(0, groceriesAmt - actualGroceries);

  const savePctHit = savingsAmt
    ? Math.min(100, Math.round((actualSavings / savingsAmt) * 100))
    : 0;
  const investPctHit = investingAmt
    ? Math.min(100, Math.round((actualInvesting / investingAmt) * 100))
    : 0;
  const saveRemaining = Math.max(0, savingsAmt - actualSavings);
  const investRemaining = Math.max(0, investingAmt - actualInvesting);

  /* --------------- Per-paycheck / period split --------------------- */

  // current calendar for display
  const calYear = viewFirst.getFullYear();
  const calMonth = viewFirst.getMonth();
  const first = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startWeekday = first.getDay();
  const midDay = 15;

  // Groceries weekly breakdown for the selected month (proportional to days in week that fall in-month)
  const groWeeks = React.useMemo(() => {
    const weeks = weeksOfMonth(calYear, calMonth, 0); // Sunday-start
    if (groceriesAmt <= 0 || weeks.length === 0) return [];
    const perDay = groceriesAmt / daysInMonth;
    return weeks.map((w, i) => {
      const amt = Math.round(perDay * w.inMonthDays);
      const label = `${w.start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })} – ${w.end.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`;
      return { i, label, amount: amt };
    });
  }, [groceriesAmt, calYear, calMonth, daysInMonth]);

  const depositsP1 = React.useMemo(
    () => deposits.filter((d) => (normalizeDateToDay(d.date) ?? 99) <= midDay),
    [deposits]
  );
  const depositsP2 = React.useMemo(
    () => deposits.filter((d) => (normalizeDateToDay(d.date) ?? 0) > midDay),
    [deposits]
  );

  const incomeP1 = React.useMemo(
    () => +depositsP1.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2),
    [depositsP1]
  );
  const incomeP2 = React.useMemo(
    () => +depositsP2.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2),
    [depositsP2]
  );

  const billsP1 = React.useMemo(
    () => bills.filter((b) => (b.day ?? 99) <= midDay),
    [bills]
  );
  const billsP2 = React.useMemo(
    () => bills.filter((b) => (b.day ?? 0) > midDay),
    [bills]
  );

  const totalBillsP1 = React.useMemo(
    () => +billsP1.reduce((s, b) => s + b.amountAbs, 0).toFixed(2),
    [billsP1]
  );
  const totalBillsP2 = React.useMemo(
    () => +billsP2.reduce((s, b) => s + b.amountAbs, 0).toFixed(2),
    [billsP2]
  );

  // Weighted allocation toward the period with more discretionary cash
  const discretionaryP1 = Math.max(0, incomeP1 - totalBillsP1);
  const discretionaryP2 = Math.max(0, incomeP2 - totalBillsP2);
  const hasTwoPaychecks = depositsP1.length > 0 && depositsP2.length > 0;
  // Fallback weights if only one paycheck exists: weight by bills (or even split)
  const w1 = hasTwoPaychecks ? discretionaryP1 : Math.max(1, totalBillsP1);
  const w2 = hasTwoPaychecks ? discretionaryP2 : Math.max(1, totalBillsP2);

  // Allocate Groceries first (weighted by discretionary)
  const [groP1, groP2] = proportionalAlloc(groceriesAmt, w1, w2);

  // Recompute discretionary *after* groceries, to split savings/investing
  const discretionaryAfterGroP1 = Math.max(0, discretionaryP1 - groP1);
  const discretionaryAfterGroP2 = Math.max(0, discretionaryP2 - groP2);

  // Allocate savings/investing using the post-groceries discretionary
  const [saveP1, saveP2] = proportionalAlloc(
    savingsAmt,
    Math.max(discretionaryAfterGroP1, w1),
    Math.max(discretionaryAfterGroP2, w2)
  );
  const [investP1, investP2] = proportionalAlloc(
    investingAmt,
    Math.max(discretionaryAfterGroP1, w1),
    Math.max(discretionaryAfterGroP2, w2)
  );

  function proportionalAlloc(
    target: number,
    d1: number,
    d2: number
  ): [number, number] {
    const total = d1 + d2;
    if (target <= 0) return [0, 0];
    if (total <= 0) {
      // absolute fallback: even split
      const p1 = Math.round(target / 2);
      return [p1, target - p1];
    }
    const p1 = Math.round((target * d1) / total);
    const p2 = target - p1;
    return [p1, p2];
  }

  const availableP1 = +(
    (incomeP1 || 0) -
    (totalBillsP1 || 0) -
    (groP1 || 0) -
    (saveP1 || 0) -
    (investP1 || 0)
  ).toFixed(2);

  const availableP2 = +(
    (incomeP2 || 0) -
    (totalBillsP2 || 0) -
    (groP2 || 0) -
    (saveP2 || 0) -
    (investP2 || 0)
  ).toFixed(2);

  const availableToSpend = React.useMemo(() => {
    const left =
      totalIncome -
      totalBills -
      (groceriesAmt || 0) -
      (savingsAmt || 0) -
      (investingAmt || 0);
    return +left.toFixed(2);
  }, [totalIncome, totalBills, groceriesAmt, savingsAmt, investingAmt]);

  // Labels for periods
  const depositDays = React.useMemo(
    () =>
      deposits
        .map((d) => normalizeDateToDay(d.date))
        .filter((n): n is number => Number.isFinite(n))
        .sort((a, b) => a - b),
    [deposits]
  );
  const usePaycheckLabels = depositDays.length === 2;
  const labelP1 = usePaycheckLabels
    ? `Paycheck 1 (day ${depositDays[0]})`
    : "Pay Period 1 (1–15)";
  const labelP2 = usePaycheckLabels
    ? `Paycheck 2 (day ${depositDays[1]})`
    : `Pay Period 2 (16–${daysInMonth})`;

  /* ----------------- Calendar maps: bills & deposits ---------------- */

  const billDays = React.useMemo(() => {
    const map = new Map<
      number,
      Array<{ txId: string; label: string; amount: number; category: string }>
    >();
    for (const b of bills) {
      if (!b.day) continue;
      const arr = map.get(b.day) || [];
      const label = b.description || b.category;
      const existing = arr.find((x) => x.label === label);
      if (existing) existing.amount += b.amountAbs;
      else
        arr.push({
          txId: b.id,
          label,
          amount: b.amountAbs,
          category: b.category,
        });
      map.set(b.day, arr);
    }
    return map;
  }, [bills]);

  const billDaysForView = React.useMemo(() => {
    const map = new Map(billDays);
    if (map.has(31) && daysInMonth < 31) {
      const moved = map.get(31)!;
      const last = daysInMonth;
      const existing = map.get(last) || [];
      map.set(last, existing.concat(moved));
      map.delete(31);
    }
    return map;
  }, [billDays, daysInMonth]);

  const depositDaysMap = React.useMemo(() => {
    const map = new Map<
      number,
      { total: number; items: Array<{ label: string; amount: number }> }
    >();
    for (const d of deposits) {
      const day = normalizeDateToDay(d.date);
      if (!day) continue;
      const amt = Number(d.amount ?? 0);
      const entry = map.get(day) || { total: 0, items: [] };
      entry.total += amt;
      entry.items.push({ label: pretty(d.description), amount: amt });
      map.set(day, entry);
    }
    return map;
  }, [deposits]);

  /* --------------------- Day Reconcile dialog state ---------------------- */

  const [openDay, setOpenDay] = React.useState<number | null>(null);
  const CategoryManagerDialog =
    require("@/components/CategoryManagerDialog").default;

  // Recompute applied rows for dialog after edits
  const [rowsShadow, setRowsShadow] = React.useState<TxRow[] | null>(null);
  const effectiveRows = rowsShadow ?? rows;

  const dayTxsEffective = React.useMemo(() => {
    if (!openDay) return [];
    return effectiveRows
      .filter((r) => normalizeDateToDay(r.date) === openDay)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [openDay, effectiveRows]);

  const refreshAfterChange = React.useCallback(() => {
    const idx = readIndex();
    const picked = Object.values(idx).find(
      (s: any) => s?.label === stmtLabel
    ) as any;
    if (!picked || !Array.isArray(picked.cachedTx)) return;
    const rules = readCatRules();
    const prepared: TxLike[] = picked.cachedTx.map(ensureTxLike);
    const applied = applyCategoryRulesTo(
      rules,
      prepared,
      applyAlias
    ) as TxLike[];
    const updated: TxRow[] = applied.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amount: r.amount,
      category: r.category,
      categoryOverride: r.categoryOverride,
      cardLast4: r.cardLast4,
      user: r.user,
    }));
    setRowsShadow(updated);
  }, [stmtLabel]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Header / Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Budget</h1>

          {/* View toggle */}
          <div className="ml-2 inline-flex rounded-xl overflow-hidden border border-slate-700">
            <button
              onClick={() => setViewOffset(0)}
              className={`px-3 py-1 text-xs ${
                viewOffset === 0
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800/50"
              }`}
              aria-pressed={viewOffset === 0}
            >
              This Month
            </button>
            <button
              onClick={() => setViewOffset(1)}
              className={`px-3 py-1 text-xs ${
                viewOffset === 1
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800/50"
              }`}
              aria-pressed={viewOffset === 1}
            >
              Next Month
            </button>
          </div>

          {rows.length > 0 ? (
            <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
              Based on statement: {stmtLabel}
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
              No statement data found yet
            </span>
          )}
          <div className="ml-auto text-sm text-slate-300">
            Savings & investing are monthly targets; allocation across pay
            periods is weighted by leftover cash after bills.
          </div>
        </div>

        {/* Key numbers */}
        <div className="grid md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 flex flex-col">
            <h3 className="font-semibold mb-2 text-left">Income</h3>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-2xl font-semibold text-emerald-400">
                {money(totalIncome)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 flex flex-col">
            <h3 className="font-semibold mb-2 text-left">Mandatory Bills</h3>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-2xl font-semibold text-rose-400">
                -{money(totalBills)}
              </div>
            </div>
          </div>

          {/* Groceries Target */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Groceries Target</h3>
              <span className="text-sm">{groPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={groPct}
              onChange={(e) => setGroPct(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 text-sm text-slate-300">
              {money(groceriesAmt)} (target from slider)
            </div>

            {/* Actuals vs Target */}
            <div className="mt-3 text-xs text-slate-400">
              Actual: {money(actualGroceries)} ({groPctHit}%)
              {groRemaining > 0 && <> · Remaining: {money(groRemaining)}</>}
            </div>
            <div className="mt-2 h-2 w-full rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.min(100, groPctHit)}%` }}
              />
            </div>
          </div>

          {/* Savings Target */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Savings Target</h3>
              <span className="text-sm">{savePct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={savePct}
              onChange={(e) => setSavePct(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="mt-1 text-sm text-slate-300">
              {money(savingsAmt)} (target from slider)
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Actual: {money(actualSavings)} ({savePctHit}%)
              {saveRemaining > 0 && <> · Remaining: {money(saveRemaining)}</>}
            </div>
            <div className="mt-2 h-2 w-full rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, savePctHit)}%` }}
              />
            </div>
          </div>

          {/* Investing Target */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Investing Target</h3>
              <span className="text-sm">{investPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={investPct}
              onChange={(e) => setInvestPct(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="mt-1 text-sm text-slate-300">
              {money(investingAmt)} (target from slider)
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Actual: {money(actualInvesting)} ({investPctHit}%)
              {investRemaining > 0 && (
                <> · Remaining: {money(investRemaining)}</>
              )}
            </div>
            <div className="mt-2 h-2 w-full rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(100, investPctHit)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Available to Spend — split view */}
        <div className="grid md:grid-cols-2 gap-3">
          {/* Left: Total */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 flex flex-col">
            <h3 className="font-semibold mb-2 text-left">Available to Spend</h3>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-4xl font-semibold text-cyan-400">
                {money(availableToSpend)}
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Income − Bills − Savings − Investing
            </div>
          </div>

          {/* Right: Per Paycheck / Period (weighted targets) */}
          <div className="rounded-2xl border border-violet-600/60 bg-violet-900/10 p-5">
            <div className="text-sm text-violet-200">
              Available to Spend (Per Paycheck)
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Period 1 */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">{labelP1}</div>
                <div
                  className={`mt-1 text-xl font-bold ${
                    availableP1 >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {money(availableP1)}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                  <div>Income: {money(incomeP1)}</div>
                  <div>Bills: -{money(totalBillsP1)}</div>
                  <div>Groceries: -{money(groP1)}</div>
                  <div>Savings: -{money(saveP1)}</div>
                  <div>Investing: -{money(investP1)}</div>
                </div>
              </div>

              {/* Period 2 */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">{labelP2}</div>
                <div
                  className={`mt-1 text-xl font-bold ${
                    availableP2 >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {money(availableP2)}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                  <div>Income: {money(incomeP2)}</div>
                  <div>Bills: -{money(totalBillsP2)}</div>
                  <div>Groceries: -{money(groP2)}</div>
                  <div>Savings: -{money(saveP2)}</div>
                  <div>Investing: -{money(investP2)}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Targets are weighted by each period’s discretionary share (income
              − bills), keeping monthly goals intact while avoiding negatives.
            </div>
          </div>
        </div>

        {/* Groceries by Week (for selected month) */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Groceries by Week —{" "}
              {viewFirst.toLocaleString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            {isForecast && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-900/20 text-amber-200">
                Forecast
              </span>
            )}
          </div>

          {groWeeks.length === 0 ? (
            <div className="text-sm text-slate-400 mt-2">
              No groceries target set.
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groWeeks.map((w) => (
                <li
                  key={w.i}
                  className="rounded-xl border border-slate-700 bg-slate-900/60 p-3"
                >
                  <div className="text-xs text-slate-400">{w.label}</div>
                  <div className="mt-1 text-xl font-semibold text-amber-400">
                    {fmtUSD.format(w.amount)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Target grocery spend
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 text-xs text-slate-400">
            Weekly targets are proportional to how many days of each week fall
            in this month, keeping your monthly groceries target (
            {money(groceriesAmt)}) intact.
          </div>
        </div>

        {/* Bill Calendar (current month) */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Bill Calendar —{" "}
              {viewFirst.toLocaleString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <button
              onClick={() =>
                (
                  document.getElementById("budget-cat-mgr-trigger") as any
                )?.click?.()
              }
              className="text-xs rounded-lg px-3 py-1 border border-slate-700 hover:bg-slate-800"
              title="Edit Categories"
            >
              Edit Categories…
            </button>
          </div>

          <div className="grid grid-cols-7 text-xs text-slate-400 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-1">
                {d}
              </div>
            ))}
          </div>

          <div
            key={`cal-${calYear}-${calMonth}`}
            className="grid grid-cols-7 gap-1"
          >
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div
                key={`sp-${i}`}
                className="h-20 rounded-lg border border-slate-800 bg-slate-950"
              />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const hits = billDaysForView.get(day) || [];
              const hasBills = hits.length > 0;
              const isP1 = day <= 15;
              const dayBillsTotal = hits.reduce(
                (s, h) => s + (h.amount || 0),
                0
              );

              const dep = depositDaysMap.get(day);
              const hasDeposit = !!dep;
              const dayDepositTotal = dep?.total ?? 0;

              const baseClass = hasBills
                ? isP1
                  ? "border-violet-500/60 bg-violet-900/20"
                  : "border-indigo-500/60 bg-indigo-900/20"
                : "border-slate-800 bg-slate-950";

              return (
                <button
                  key={day}
                  onClick={() => setOpenDay(day)}
                  className={`relative h-20 rounded-lg border p-2 overflow-hidden text-left ${baseClass}
                    ${
                      hasDeposit ? "ring-1 ring-emerald-500/40" : ""
                    } hover:ring-2 hover:ring-cyan-500/50`}
                  title={[
                    hasBills
                      ? `Bills: ${hits
                          .map((h) => `${h.label} (${money(h.amount)})`)
                          .join(", ")} • Total ${money(dayBillsTotal)}`
                      : "No bills",
                    hasDeposit
                      ? `Deposits: ${dep!.items
                          .map((x) => `${x.label} (+${money(x.amount)})`)
                          .join(", ")} • Total +${money(dayDepositTotal)}`
                      : "No deposits",
                  ].join(" | ")}
                >
                  {/* Day number */}
                  <div
                    className={`text-[11px] ${
                      hasBills ? "text-white" : "text-slate-400"
                    }`}
                  >
                    {day.toString().padStart(2, "0")}
                  </div>

                  {/* Bill items preview */}
                  {hasBills && (
                    <div className="mt-1 space-y-0.5 pr-14">
                      {hits.slice(0, 2).map((h, idx) => (
                        <div key={idx} className="truncate text-[11px]">
                          • {h.label}:{" "}
                          <span className="text-rose-300">
                            -{money(h.amount)}
                          </span>
                        </div>
                      ))}
                      {hits.length > 2 && (
                        <div className="text-[11px] text-slate-300">
                          +{hits.length - 2} more…
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bill total badge (top-right) */}
                  {hasBills && (
                    <div
                      className="absolute top-1 right-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium
                        bg-rose-900/30 border border-rose-500/50 text-rose-200"
                    >
                      -{money(dayBillsTotal)}
                    </div>
                  )}

                  {/* Deposit (payday) total badge (bottom-right) */}
                  {hasDeposit && (
                    <div
                      className="absolute bottom-1 right-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium
                        bg-emerald-900/30 border border-emerald-500/50 text-emerald-200"
                    >
                      +{money(dayDepositTotal)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-rose-500/50 bg-rose-900/30" />{" "}
              Bill total
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded border border-emerald-500/50 bg-emerald-900/30" />{" "}
              Deposit (payday) total
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded ring-1 ring-emerald-500/40" />{" "}
              Payday highlight
            </span>
          </div>
        </div>

        {/* Bills list */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Mandatory Bills (from selected statement)
            </h3>
            <span className="text-sm text-slate-400">
              {bills.length} items · {money(totalBills)}
            </span>
          </div>
          {bills.length === 0 ? (
            <div className="text-sm text-slate-400 mt-2">
              No likely bills detected.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-800">
              {bills.map((b) => (
                <li key={b.id} className="py-2 flex items-center gap-3">
                  <div className="w-10 text-sm text-slate-400 tabular-nums">
                    {b.day ? b.day.toString().padStart(2, "0") : "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {b.description || b.category}
                    </div>
                    <div className="text-xs text-slate-400">{b.category}</div>
                  </div>
                  <div className="text-rose-300 font-medium">
                    -{money(b.amountAbs)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Hidden trigger to open category manager from calendar button */}
      <button
        id="budget-cat-mgr-trigger"
        onClick={() => {}}
        className="hidden"
      />
      <CategoryManagerDialog
        open={false}
        onClose={() => {}}
        // The visible "Edit Categories…" button above uses the hidden trigger
      />

      {/* Day Reconcile Dialog */}
      {openDay &&
        (() => {
          const selectedHits = billDays.get(openDay) || [];
          const selectedTotal = selectedHits.reduce(
            (s, h) => s + (h.amount || 0),
            0
          );

          return (
            <div className="fixed inset-0 z-50 grid place-items-center p-4">
              {/* BACKDROP */}
              <button
                aria-label="Close overlay"
                onClick={() => setOpenDay(null)}
                className="absolute inset-0 bg-black/70"
              />
              {/* PANEL */}
              <div
                className={[
                  "relative w-screen h-dvh rounded-none overflow-hidden border border-slate-700 bg-slate-900 shadow-xl",
                  "sm:h-auto sm:w-full sm:max-w-3xl sm:rounded-2xl",
                  "grid grid-rows-[auto,1fr,auto]",
                ].join(" ")}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reconcile-title"
              >
                {/* HEADER (sticky) */}
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur">
                  <h4
                    id="reconcile-title"
                    className="text-base sm:text-lg font-semibold"
                  >
                    Reconcile — Day {String(openDay).padStart(2, "0")}
                    {selectedHits.length > 0 && (
                      <span className="ml-3 text-xs sm:text-sm font-medium text-rose-300">
                        Total: -{money(selectedTotal)}
                      </span>
                    )}
                  </h4>
                  <button
                    onClick={() => setOpenDay(null)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>

                {/* BODY (scrollable) */}
                <div className="min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
                  {dayTxsEffective.length === 0 ? (
                    <div className="text-sm text-slate-400">
                      No transactions on this day.
                    </div>
                  ) : (
                    <>
                      {/* Mobile: stacked cards */}
                      <div className="sm:hidden space-y-3">
                        {dayTxsEffective.map((t) => {
                          const currentCat = (
                            t.categoryOverride ??
                            t.category ??
                            "Uncategorized"
                          ).trim();
                          const k = keyForTx(
                            t.date || "",
                            t.description || "",
                            t.amount ?? 0
                          );
                          const includeByOverride = billOverrides[t.id];
                          const inferred = isMandatoryCategory(
                            currentCat,
                            t.description
                          );
                          const billChecked =
                            includeByOverride === true
                              ? true
                              : includeByOverride === false
                              ? false
                              : inferred;

                          return (
                            <div
                              key={t.id}
                              className="rounded-xl border border-slate-800 p-3 bg-slate-900/60"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-sm">
                                    {pretty(t.description)}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {t.date}
                                  </div>
                                </div>
                                <div
                                  className={
                                    "text-right text-sm " +
                                    (t.amount < 0
                                      ? "text-rose-300"
                                      : "text-emerald-300")
                                  }
                                >
                                  {money(Math.abs(t.amount))}
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-2">
                                <CategorySelect
                                  value={currentCat}
                                  onChange={(val) => {
                                    writeOverride(k, val);
                                    const aliasLabel = applyAlias(
                                      (t.description || "").trim()
                                    );
                                    const keys = candidateKeys(
                                      t.description || "",
                                      aliasLabel
                                    );
                                    upsertCategoryRules(keys, val);
                                    refreshAfterChange();
                                  }}
                                />
                                <label className="inline-flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={!!billChecked}
                                    onChange={(e) =>
                                      setBillOverrides((m) => ({
                                        ...m,
                                        [t.id]: e.target.checked,
                                      }))
                                    }
                                  />
                                  Include in bill calendar
                                </label>

                                <div className="flex flex-wrap gap-2 pt-1">
                                  <button
                                    onClick={() => {
                                      const newCat = "Transfer:Savings";
                                      writeOverride(k, newCat);
                                      const aliasLabel = applyAlias(
                                        (t.description || "").trim()
                                      );
                                      const keys = candidateKeys(
                                        t.description || "",
                                        aliasLabel
                                      );
                                      upsertCategoryRules(keys, newCat);
                                      refreshAfterChange();
                                    }}
                                    className="text-xs rounded-lg px-2 py-1 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/20"
                                    title="Count this toward your Savings target"
                                  >
                                    Mark Savings
                                  </button>

                                  <button
                                    onClick={() => {
                                      const newCat = "Transfer:Investing";
                                      writeOverride(k, newCat);
                                      const aliasLabel = applyAlias(
                                        (t.description || "").trim()
                                      );
                                      const keys = candidateKeys(
                                        t.description || "",
                                        aliasLabel
                                      );
                                      upsertCategoryRules(keys, newCat);
                                      refreshAfterChange();
                                    }}
                                    className="text-xs rounded-lg px-2 py-1 border border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/20"
                                    title="Count this toward your Investing target"
                                  >
                                    Mark Investing
                                  </button>

                                  <button
                                    onClick={() =>
                                      (
                                        document.getElementById(
                                          "budget-cat-mgr-trigger"
                                        ) as any
                                      )?.click?.()
                                    }
                                    className="text-xs rounded-lg px-2 py-1 border border-slate-700 hover:bg-slate-800"
                                  >
                                    Edit categories…
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop: table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-800/60 sticky top-0 z-10">
                            <tr>
                              <th className="text-left p-2">Description</th>
                              <th className="text-left p-2">Category</th>
                              <th className="text-left p-2">Bill?</th>
                              <th className="text-right p-2">Amount</th>
                              <th className="text-right p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayTxsEffective.map((t) => {
                              const currentCat = (
                                t.categoryOverride ??
                                t.category ??
                                "Uncategorized"
                              ).trim();
                              const k = keyForTx(
                                t.date || "",
                                t.description || "",
                                t.amount ?? 0
                              );
                              const includeByOverride = billOverrides[t.id];
                              const inferred = isMandatoryCategory(
                                currentCat,
                                t.description
                              );
                              const billChecked =
                                includeByOverride === true
                                  ? true
                                  : includeByOverride === false
                                  ? false
                                  : inferred;

                              return (
                                <tr
                                  key={t.id}
                                  className="border-t border-slate-800"
                                >
                                  <td className="p-2">
                                    <div className="font-medium">
                                      {pretty(t.description)}
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      {t.date}
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <CategorySelect
                                      value={currentCat}
                                      onChange={(val) => {
                                        writeOverride(k, val);
                                        const aliasLabel = applyAlias(
                                          (t.description || "").trim()
                                        );
                                        const keys = candidateKeys(
                                          t.description || "",
                                          aliasLabel
                                        );
                                        upsertCategoryRules(keys, val);
                                        refreshAfterChange();
                                      }}
                                    />
                                  </td>
                                  <td className="p-2">
                                    <label className="inline-flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={!!billChecked}
                                        onChange={(e) =>
                                          setBillOverrides((m) => ({
                                            ...m,
                                            [t.id]: e.target.checked,
                                          }))
                                        }
                                      />
                                      Include in bill calendar
                                    </label>
                                  </td>
                                  <td className="p-2 text-right">
                                    <span
                                      className={
                                        t.amount < 0
                                          ? "text-rose-300"
                                          : "text-emerald-300"
                                      }
                                    >
                                      {money(Math.abs(t.amount))}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right space-x-2">
                                    <button
                                      onClick={() => {
                                        const newCat = "Transfer:Savings";
                                        writeOverride(k, newCat);
                                        const aliasLabel = applyAlias(
                                          (t.description || "").trim()
                                        );
                                        const keys = candidateKeys(
                                          t.description || "",
                                          aliasLabel
                                        );
                                        upsertCategoryRules(keys, newCat);
                                        refreshAfterChange();
                                      }}
                                      className="text-xs rounded-lg px-2 py-1 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/20"
                                      title="Count this toward your Savings target"
                                    >
                                      Mark Savings
                                    </button>

                                    <button
                                      onClick={() => {
                                        const newCat = "Transfer:Investing";
                                        writeOverride(k, newCat);
                                        const aliasLabel = applyAlias(
                                          (t.description || "").trim()
                                        );
                                        const keys = candidateKeys(
                                          t.description || "",
                                          aliasLabel
                                        );
                                        upsertCategoryRules(keys, newCat);
                                        refreshAfterChange();
                                      }}
                                      className="text-xs rounded-lg px-2 py-1 border border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/20"
                                      title="Count this toward your Investing target"
                                    >
                                      Mark Investing
                                    </button>

                                    <button
                                      onClick={() =>
                                        (
                                          document.getElementById(
                                            "budget-cat-mgr-trigger"
                                          ) as any
                                        )?.click?.()
                                      }
                                      className="text-xs rounded-lg px-2 py-1 border border-slate-700 hover:bg-slate-800"
                                    >
                                      Edit categories…
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* FOOTER (sticky) */}
                <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-400 sticky bottom-0 bg-slate-900/95 backdrop-blur">
                  Tip: Re-categorizing will also seed a simple rule so future
                  imports categorize automatically.
                </div>
              </div>
            </div>
          );
        })()}

      <DemoBudgetTips />
    </ProtectedRoute>
  );
}
