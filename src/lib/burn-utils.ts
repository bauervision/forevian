// lib/burn-utils.ts
export type Tx = {
  id?: string;
  date?: string;
  description?: string;
  amount: number;
  category?: string;
  categoryOverride?: string;
  user?: string;
  cardLast4?: string;
};

const BURN_EXCLUDE = new Set([
  "Transfers",
  "Debt",
  "Cash Back",
  // Hard-coded structural bills — adjust to your taste
  "Bills",
  "Utilities",
  "Insurance",
  "Mortgage",
  "Rent",
]);

export const catOf = (r: Tx) =>
  ((r.categoryOverride ?? r.category) || "Uncategorized").trim();

const norm = (s: string) => s.trim().toLowerCase();

/** Keyed per Spender + Statement + Period for TX exclusions */
function lsKeyTx(
  spender: string,
  statementId: string,
  period: "CURRENT" | "YTD"
) {
  return `forevian.burnExclusions.v1::${spender}::${statementId}::${period}`;
}

/** Keyed per Spender + Statement + Period for CATEGORY exclusions */
function lsKeyCats(
  spender: string,
  statementId: string,
  period: "CURRENT" | "YTD"
) {
  return `forevian.burnExcludedCats.v1::${spender}::${statementId}::${period}`;
}

export function readBurnExclusions(
  spender: string,
  statementId: string,
  period: "CURRENT" | "YTD"
) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = localStorage.getItem(lsKeyTx(spender, statementId, period));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set<string>();
  }
}

export function writeBurnExclusions(
  spender: string,
  statementId: string,
  period: "CURRENT" | "YTD",
  s: Set<string>
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    lsKeyTx(spender, statementId, period),
    JSON.stringify([...s])
  );
}

export function readBurnExcludedCats(
  spender: string,
  statementId: string,
  period: "CURRENT" | "YTD"
) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = localStorage.getItem(lsKeyCats(spender, statementId, period));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    // store normalized
    return new Set(arr.map(norm));
  } catch {
    return new Set<string>();
  }
}

export function writeBurnExcludedCats(
  spender: string,
  statementId: string,
  period: "CURRENT" | "YTD",
  s: Set<string>
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    lsKeyCats(spender, statementId, period),
    JSON.stringify([...s])
  );
}

// base True-Spend-like eligibility
export function isBurnEligibleBase(r: Tx) {
  const c = catOf(r);
  return r.amount < 0 && !BURN_EXCLUDE.has(c) && !isIncomeCategory(c);
}

// same as above but honors user-chosen excluded categories
export function isBurnEligibleWithCats(r: Tx, excludedCatsNorm: Set<string>) {
  if (!isBurnEligibleBase(r)) return false;
  return !excludedCatsNorm.has(norm(catOf(r)));
}

// Tx identity fallback
export function txKey(r: Tx) {
  const d = (r.date || "").trim();
  const a = String(r.amount);
  const desc = (r.description || "").trim().slice(0, 80);
  return r.id ? `id:${r.id}` : `d:${d}|a:${a}|t:${desc}`;
}

/** Days in scope */
export function computePeriodDays(
  stmtYear: number,
  stmtMonth: number,
  period: "CURRENT" | "YTD"
) {
  if (period === "CURRENT") {
    const days = new Date(stmtYear, stmtMonth, 0).getDate(); // 1..12 month
    return days || 30;
  }
  const end = new Date(stmtYear, stmtMonth, 0);
  const start = new Date(stmtYear, 0, 1);
  return Math.max(1, Math.round((+end - +start) / 86400000) + 1);
}

// ----- Burn "health" helpers -----
/** Optional per-spender daily target override (USD/day). */
export function readBurnTargetDaily(spender: string) {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`forevian.burnTargetDaily.v1::${spender}`);
  return raw ? Number(raw) : null;
}
export function writeBurnTargetDaily(spender: string, value: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `forevian.burnTargetDaily.v1::${spender}`,
    String(value)
  );
}

/**
 * Decide band for a burn/day number.
 * Default target = 30% of household income per day (50/30/20 guideline).
 * Bands: <=100% target → "ok", <=150% → "warn", >150% → "hot".
 */
export function classifyBurn(
  burnPerDay: number,
  incomePerDay: number,
  customTargetDaily?: number | null
): "ok" | "warn" | "hot" {
  const target = Math.max(1, customTargetDaily ?? incomePerDay * 0.3);
  const ratio = burnPerDay / target;
  if (ratio <= 1.0) return "ok";
  if (ratio <= 1.5) return "warn";
  return "hot";
}

// Normalize helper
const n = (s: string) => (s || "").trim().toLowerCase();

/** Treat these as income-like buckets; never part of burn controls. */
const INCOME_LIKE = new Set([
  "income/payroll",
  "income",
  "payroll",
  "salary",
  "direct deposit",
  "deposit",
  "refund",
]);

export function isIncomeCategory(cat: string) {
  const v = n(cat);
  if (INCOME_LIKE.has(v)) return true;
  // fuzzy contains for common phrasing
  return (
    v.includes("income") ||
    v.includes("payroll") ||
    v.includes("salary") ||
    v.includes("deposit") ||
    v.includes("refund")
  );
}
