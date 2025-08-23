"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
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
import CategoryManagerDialog from "@/components/CategoryManagerDialog";

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

/** Minimal, readable merchant text */
function pretty(desc?: string) {
  const s = (desc || "").replace(/\s+/g, " ").trim();
  return s.replace(/^purchase authorized on\s*\d{1,2}[\/\-]\d{1,2}\s*/i, "");
}

/** Mandatory bill detector by category name (adjust as desired) */
function isMandatoryCategory(catRaw: string, desc?: string) {
  const c = (catRaw || "").toLowerCase();
  const d = (desc || "").toLowerCase();

  // 1) Obvious mandatory categories by name
  if (/(^|\s)(rent|mortgage)($|\s)/.test(c)) return true;
  if (/(^|\s)insurance($|\s)/.test(c)) return true;
  if (/(^|\s)(debt|loan|credit\s*card)($|\s)/.test(c)) return true;
  if (/subscription|subscriptions|stream/.test(c)) return true;
  if (/membership|memberships/.test(c)) return true;

  // 2) Utilities — DO NOT match generic "gas" (fuel). Require utility context.
  if (/utilities|utility|power|water|internet/.test(c)) return true;
  // Gas *utility* only if the category mentions it in a utility context
  if (/(natural\s*gas|gas\s*utility|utility:\s*gas|gas\s*\(utility\))/.test(c))
    return true;

  // 3) Merchant allow-list (helps when category is generic but merchant is a utility)
  // Expand as needed for your region/providers.
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

  // Everything else (incl. Fuel/Gas station) is NOT a mandatory bill by default
  return false;
}

/** Persisted slider hook */
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

/** Ensure rows satisfy rules engine's required fields */
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

/* -------------------------- Categories Select --------------------------- */

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
  const [openMgr, setOpenMgr] = React.useState(false);

  const sorted = React.useMemo(() => {
    const set: Set<string> = new Set(
      (categories || []).map((c: string) => c.trim()).filter(Boolean)
    );
    if (value && !set.has(value)) set.add(value);

    const list = Array.from(set) as string[]; // <-- cast as string[]
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
        {sorted.map((opt: string) => (
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

/* ------------------------------------------------------------------ */
/* Statement selection: last issued statement with data                */
/* ------------------------------------------------------------------ */

function useLatestIssuedWithData(): {
  label?: string;
  month?: number;
  year?: number;
  rows: TxRow[];
} {
  return React.useMemo(() => {
    const idx = readIndex();
    const all = Object.values(idx) as Array<{
      id: string;
      label: string;
      stmtYear: number;
      stmtMonth: number; // 1-12
      cachedTx?: any[];
    }>;

    if (!all.length) return { rows: [] };

    // Start from last month, not current
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastY = lastMonth.getFullYear();
    const lastM = lastMonth.getMonth() + 1; // 1-12

    // Sort DESC by (year, month)
    const sorted = all.sort(
      (a, b) => b.stmtYear - a.stmtYear || b.stmtMonth - a.stmtMonth
    );

    const hasRows = (s: any) =>
      Array.isArray(s.cachedTx) && s.cachedTx.length > 0;

    // Prefer <= last month with rows
    let picked = sorted.find(
      (s) =>
        (s.stmtYear < lastY ||
          (s.stmtYear === lastY && s.stmtMonth <= lastM)) &&
        hasRows(s)
    );

    // Fallback: any with rows
    if (!picked) picked = sorted.find(hasRows);
    if (!picked) return { rows: [] };

    // Apply rules
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
  }, []);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function BudgetPage() {
  const { label: stmtLabel, rows } = useLatestIssuedWithData();

  // Split income / expenses
  const deposits = React.useMemo(
    () => rows.filter((r) => (r.amount ?? 0) > 0),
    [rows]
  );
  const withdrawals = React.useMemo(
    () => rows.filter((r) => (r.amount ?? 0) < 0),
    [rows]
  );

  // Income = total deposits
  const totalIncome = React.useMemo(
    () => +deposits.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2),
    [deposits]
  );

  // --- Bill include/exclude overrides (local, non-destructive) ---
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

  // Mandatory bills from selected statement
  const bills = React.useMemo(() => {
    const list = withdrawals
      .map((w) => {
        const cat = (
          w.categoryOverride ??
          w.category ??
          "Uncategorized"
        ).trim();
        const day = normalizeDateToDay(w.date);
        const includeByCat = isMandatoryCategory(cat);
        const includeByOverride = billOverrides[w.id];
        const include =
          includeByOverride === true
            ? true
            : includeByOverride === false
            ? false
            : includeByCat;

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

    // Collapse duplicates for same day/merchant
    const key = (x: (typeof list)[number]) =>
      `${x.day ?? "?"}::${x.category}::${x.description}`;
    const m = new Map<string, (typeof list)[number]>();
    for (const b of list) {
      const k = key(b);
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

  // Sliders: Savings % and Investing %
  const [savePct, setSavePct] = usePersistedNumber("ui.budget.savePct", 10);
  const [investPct, setInvestPct] = usePersistedNumber(
    "ui.budget.investPct",
    5
  );

  const savingsAmt = Math.max(0, Math.round((totalIncome * savePct) / 100));
  const investingAmt = Math.max(0, Math.round((totalIncome * investPct) / 100));

  const availableToSpend = React.useMemo(() => {
    const left = totalIncome - totalBills - savingsAmt - investingAmt;
    return +left.toFixed(2);
  }, [totalIncome, totalBills, savingsAmt, investingAmt]);

  /* ------------------------------------------------------------------ */
  /* Per-paycheck/period breakdown                                      */
  /* ------------------------------------------------------------------ */

  // Current calendar (for labels & calendar grid)
  const today = new Date();
  const calYear = today.getFullYear();
  const calMonth = today.getMonth(); // 0-index
  const first = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startWeekday = first.getDay(); // 0=Sun
  const midDay = 15;

  // Period splits
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

  // Allocate savings/investing proportionally to income per period
  const totalIncomeSafe = Math.max(0, totalIncome);
  const shareP1 = totalIncomeSafe ? incomeP1 / totalIncomeSafe : 0.5;
  const shareP2 = totalIncomeSafe ? incomeP2 / totalIncomeSafe : 0.5;

  const savingsP1 = Math.round(savingsAmt * shareP1);
  const savingsP2 = Math.round(savingsAmt * shareP2);
  const investP1 = Math.round(investingAmt * shareP1);
  const investP2 = Math.round(investingAmt * shareP2);

  const availableP1 = +(
    (incomeP1 || 0) -
    (totalBillsP1 || 0) -
    (savingsP1 || 0) -
    (investP1 || 0)
  ).toFixed(2);

  const availableP2 = +(
    (incomeP2 || 0) -
    (totalBillsP2 || 0) -
    (savingsP2 || 0) -
    (investP2 || 0)
  ).toFixed(2);

  // Labeling based on deposit count
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

  // Calendar mapping for bill highlights
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

  /* --------------------- Day Reconcile dialog state ---------------------- */

  const [openDay, setOpenDay] = React.useState<number | null>(null);
  const [openCatMgr, setOpenCatMgr] = React.useState(false); // optional quick access

  // All transactions for the selected day (both deposits & withdrawals)
  const dayTxs = React.useMemo(() => {
    if (!openDay) return [];
    return rows
      .filter((r) => normalizeDateToDay(r.date) === openDay)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [openDay, rows]);

  // Re-apply rules + refresh everything after a change
  const refreshAfterChange = React.useCallback(() => {
    // We can force a re-run by triggering a noop state update via overrides+rules read
    // An easy pattern: rebuild 'rows' locally from current rows using latest rules
    const idx = readIndex();
    // find the statement we already chose by label
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

    // Replace local computed arrays by replacing the 'rows' reference.
    // Using a local state wrapper avoids prop-drilling; simplest is a small state bump:
    setRowsShadow(updated);
  }, [stmtLabel]);

  const [rowsShadow, setRowsShadow] = React.useState<TxRow[] | null>(null);
  const effectiveRows = rowsShadow ?? rows;

  // NOTE: below we keep using 'rows' derived arrays (deposits/withdrawals/bills...)
  // but for the dialog listing we use 'effectiveRows' to reflect immediate changes.
  const dayTxsEffective = React.useMemo(() => {
    if (!openDay) return [];
    return effectiveRows
      .filter((r) => normalizeDateToDay(r.date) === openDay)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [openDay, effectiveRows]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Header / Summary */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Budget</h1>
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
            Savings and investing are configurable targets for this budget.
          </div>
        </div>

        {/* Key numbers */}
        <div className="grid md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Income (statement)</div>
            <div className="mt-1 text-2xl font-semibold">
              {money(totalIncome)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Mandatory Bills</div>
            <div className="mt-1 text-2xl font-semibold text-rose-300">
              -{money(totalBills)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Savings Target</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300">
              -{money(Math.max(0, Math.round((totalIncome * savePct) / 100)))}
            </div>
            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={50}
                value={savePct}
                onChange={(e) => setSavePct(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0%</span>
                <span>{savePct}%</span>
                <span>50%</span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">Investing Target</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300">
              -{money(Math.max(0, Math.round((totalIncome * investPct) / 100)))}
            </div>
            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={50}
                value={investPct}
                onChange={(e) => setInvestPct(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0%</span>
                <span>{investPct}%</span>
                <span>50%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Available to Spend — split view */}
        <div className="grid md:grid-cols-2 gap-3">
          {/* Left: Total */}
          <div className="rounded-2xl border border-emerald-600/60 bg-emerald-900/10 p-5">
            <div className="text-sm text-emerald-300">
              Available to Spend (Month)
            </div>
            <div
              className={`mt-1 text-3xl font-extrabold ${
                availableToSpend >= 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {money(availableToSpend)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Income − Bills − Savings − Investing
            </div>
          </div>

          {/* Right: Per Paycheck / Period */}
          <div className="rounded-2xl border border-violet-600/60 bg-violet-900/10 p-5">
            <div className="text-sm text-violet-200">
              Available to Spend (Per Paycheck)
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Period 1 */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">
                  {depositDays.length === 2
                    ? `Paycheck 1 (day ${depositDays[0]})`
                    : "Pay Period 1 (1–15)"}
                </div>
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
                  <div>Savings: -{money(savingsP1)}</div>
                  <div>Investing: -{money(investP1)}</div>
                </div>
              </div>

              {/* Period 2 */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <div className="text-xs text-slate-400">
                  {depositDays.length === 2
                    ? `Paycheck 2 (day ${depositDays[1]})`
                    : `Pay Period 2 (16–${daysInMonth})`}
                </div>
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
                  <div>Savings: -{money(savingsP2)}</div>
                  <div>Investing: -{money(investP2)}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Periods are split by calendar days (1–15, 16–{daysInMonth}). If
              exactly two deposits were found, they’re labeled as Paycheck 1/2.
            </div>
          </div>
        </div>

        {/* Bill Calendar (current month) */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Bill Calendar —{" "}
              {today.toLocaleString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <button
              onClick={() => setOpenCatMgr(true)}
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

          <div className="grid grid-cols-7 gap-1">
            {/* empty slots before 1st */}
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div
                key={`sp-${i}`}
                className="h-20 rounded-lg border border-slate-800 bg-slate-950"
              />
            ))}
            {/* days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const hits = billDays.get(day) || [];
              const hasBills = hits.length > 0;
              const isP1 = day <= 15;
              const dayTotal = hits.reduce((s, h) => s + (h.amount || 0), 0);

              return (
                <button
                  key={day}
                  onClick={() => setOpenDay(day)}
                  className={`relative h-20 rounded-lg border p-2 overflow-hidden text-left ${
                    hasBills
                      ? isP1
                        ? "border-violet-500/60 bg-violet-900/20"
                        : "border-indigo-500/60 bg-indigo-900/20"
                      : "border-slate-800 bg-slate-950"
                  } hover:ring-2 hover:ring-cyan-500/50`}
                  title={
                    hasBills
                      ? `Bills on ${day}: ${hits
                          .map((h) => `${h.label} (${money(h.amount)})`)
                          .join(", ")} • Total ${money(dayTotal)}`
                      : `No bills on ${day}`
                  }
                >
                  {/* Day number */}
                  <div
                    className={`text-[11px] ${
                      hasBills ? "text-white" : "text-slate-400"
                    }`}
                  >
                    {day.toString().padStart(2, "0")}
                  </div>

                  {/* List a couple of items */}
                  {hasBills && (
                    <div className="mt-1 space-y-0.5 pr-12">
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

                  {/* Daily total badge (top-right) */}
                  {hasBills && (
                    <div
                      className="absolute top-1 right-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium
                        bg-rose-900/30 border border-rose-500/50 text-rose-200"
                    >
                      -{money(dayTotal)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 mt-2">
            Click any day to reconcile transactions (re-categorize or
            include/exclude from the bill calendar).
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

      {/* Categories manager quick access */}
      <CategoryManagerDialog
        open={openCatMgr}
        onClose={() => setOpenCatMgr(false)}
      />

      {/* Day Reconcile Dialog */}
      {openDay && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpenDay(null)}
          />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                Reconcile — Day {String(openDay).padStart(2, "0")}
              </h4>
              <button
                onClick={() => setOpenDay(null)}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {/* Scrollable body */}
            <div className="p-5 overflow-y-auto max-h-[70vh]">
              {dayTxsEffective.length === 0 ? (
                <div className="text-sm text-slate-400">
                  No transactions on this day.
                </div>
              ) : (
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
                      const inferred = isMandatoryCategory(currentCat);
                      const billChecked =
                        includeByOverride === true
                          ? true
                          : includeByOverride === false
                          ? false
                          : inferred;

                      return (
                        <tr key={t.id} className="border-t border-slate-800">
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
                                onChange={(e) => {
                                  setBillOverrides((m) => ({
                                    ...m,
                                    [t.id]: e.target.checked,
                                  }));
                                }}
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
                          <td className="p-2 text-right">
                            <button
                              onClick={() => setOpenCatMgr(true)}
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
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-400">
              Tip: Re-categorizing will also seed a simple rule so future
              imports categorize automatically.
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
