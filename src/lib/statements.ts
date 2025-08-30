// /lib/statements.ts (only the migration + helpers changed)
export type StatementSnapshot = {
  id: string;
  label: string;
  stmtYear: number;
  stmtMonth: number; // 1..12
  pagesRaw: string[];
  inputs?: {
    beginningBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
  // store parsed rows so other pages (Trends) can read without re-parsing
  cachedTx?: import("@/app/providers/ReconcilerProvider").Transaction[];
  normalizerVersion?: number;
  source?: string;
};

const IDX_KEY = "reconciler.statements.index.v2";
const CUR_KEY = "reconciler.statements.current.v2";

function storagePrefix(): string {
  if (typeof window === "undefined") return "real::";
  // Treat *only* /demo and its descendants as demo
  return window.location.pathname.startsWith("/demo") ? "demo::" : "real::";
}

function KEY_IDX() {
  return `${storagePrefix()}stmts.v2`;
}
function KEY_CUR() {
  return `${storagePrefix()}stmts.currentId`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function monthLabel(m: number) {
  return MONTHS[m - 1] ?? "";
}

export function makeId(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
export function nextMonth(y: number, m: number) {
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
export function emptyStatement(
  id: string,
  label: string,
  year: number,
  month: number
): StatementSnapshot {
  return {
    id,
    label,
    stmtYear: year,
    stmtMonth: month,
    pagesRaw: [],
    inputs: { beginningBalance: 0, totalDeposits: 0, totalWithdrawals: 0 },
  };
}

export function readIndex(): Record<string, StatementSnapshot> {
  try {
    const raw = localStorage.getItem(KEY_IDX());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
export function writeIndex(idx: Record<string, StatementSnapshot>) {
  try {
    localStorage.setItem(KEY_IDX(), JSON.stringify(idx));
  } catch {}
}
export function readCurrentId(): string | null {
  try {
    return localStorage.getItem(KEY_CUR()) || null;
  } catch {
    return null;
  }
}
export function writeCurrentId(id: string) {
  try {
    localStorage.setItem(KEY_CUR(), id);
  } catch {}
}

export function upsertStatement(s: StatementSnapshot) {
  const idx = readIndex();
  idx[s.id] = s;
  writeIndex(idx);
  writeCurrentId(s.id);
}
export function removeStatement(id: string) {
  const idx = readIndex();
  delete idx[id];
  writeIndex(idx);
  const cur = readCurrentId();
  if (cur === id) writeCurrentId(Object.keys(idx)[0] ?? "");
}

// Add these helpers:

export function normalizePagesRaw(val: any): string[] {
  if (!val) return [];
  // string → [string]
  if (typeof val === "string")
    return [val]
      .map((s) => String(s))
      .map((s) => s.trim())
      .filter(Boolean);
  // array-ish
  if (Array.isArray(val))
    return val
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  // object with numeric keys { "0": "...", "1": "..." }
  if (typeof val === "object") {
    const entries = Object.entries(val)
      .filter(([k]) => /^\d+$/.test(k))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => String(v));
    if (entries.length) return entries.map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function inferMonthFromPages(
  pages: string[],
  year: number
): number | null {
  const text = pages.join("\n");
  // Prefer "Beginning balance on MM/DD"
  let m = text.match(/Beginning\s+balance\s+on\s+(\d{1,2})\/\d{1,2}/i);
  if (m) {
    const mm = Number(m[1]);
    if (mm >= 1 && mm <= 12) return mm;
  }
  // Else take the first MM/DD we see
  const all = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (all) {
    const mm = Number(all[1]);
    if (mm >= 1 && mm <= 12) return mm;
  }
  return null;
}

// --- robust migration from legacy local storage ---
export function migrateLegacyIfNeeded(): { createdId?: string } {
  const idx = readIndex();
  if (Object.keys(idx).length) return {};

  // read consolidated legacy cache
  let cache: any = null;
  try {
    cache = JSON.parse(localStorage.getItem("reconciler.cache.v1") || "null");
  } catch {}

  // derive fields
  const pagesRaw = normalizePagesRaw(cache?.pagesRaw || cache?.pages);
  const inputs =
    cache?.inputs && typeof cache.inputs === "object" ? cache.inputs : null;
  const stmtYear = Number(cache?.stmtYear) || new Date().getFullYear();

  if (!pagesRaw.length && !inputs) {
    // fallback to older split keys
    let tx: any = null,
      ins: any = null;
    try {
      tx = JSON.parse(localStorage.getItem("reconciler.tx.v1") || "null");
    } catch {}
    try {
      ins = JSON.parse(localStorage.getItem("reconciler.inputs.v1") || "null");
    } catch {}
    if (!pagesRaw.length && !tx && !ins) return {};
  }

  // infer month
  const monthGuess =
    Number(cache?.stmtMonth) ||
    Number(cache?.month) ||
    inferMonthFromPages(pagesRaw, stmtYear) ||
    new Date().getMonth() + 1;

  const id = makeId(stmtYear, monthGuess);
  const label = `Recovered ${monthLabel(monthGuess)} ${stmtYear}`;
  const s = emptyStatement(id, label, stmtYear, monthGuess);

  if (pagesRaw.length) s.pagesRaw = pagesRaw;
  if (inputs) {
    s.inputs = {
      beginningBalance: Number(inputs.beginningBalance) || 0,
      totalDeposits: Number(inputs.totalDeposits) || 0,
      totalWithdrawals: Number(inputs.totalWithdrawals) || 0,
    };
  }

  upsertStatement(s);
  return { createdId: id };
}
