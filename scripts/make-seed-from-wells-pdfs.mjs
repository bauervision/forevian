import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse"); // ← use require()

/** -------- helpers -------- */

const AMT_ONLY_LINE = /^\$?\s*\d[\d,]*\.\d{2}\s*$/;

// --- self-contained helpers for the analyzer ---
const MONTH_MAP = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const monthToNum = (m) =>
  MONTH_MAP[m.toLowerCase()] ?? MONTH_MAP[m.toLowerCase().slice(0, 3)] ?? null;

function inferStatementYear(txt, fallback = 2025) {
  const m = txt.match(
    /Fee\s+period\s+\d{1,2}\/\d{1,2}\/(\d{4})\s*-\s*\d{1,2}\/\d{1,2}\/(\d{4})/i
  );
  if (m) return Number(m[2]);
  const ys = (txt.match(/\b(20\d{2})\b/g) || [])
    .map(Number)
    .filter((y) => y >= 2010 && y <= 2100);
  return ys.length ? ys.sort((a, b) => b - a)[0] : fallback;
}

function dateAtLineStartToISO(line, year = 2025) {
  const m1 = line.match(/^\s*(\d{1,2})\/(\d{1,2})\b/);
  if (m1) return `${year}-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
  const m2 = line.match(
    /^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})\b/i
  );
  if (m2) {
    const mm = monthToNum(m2[1]);
    if (mm)
      return `${year}-${String(mm).padStart(2, "0")}-${String(m2[2]).padStart(
        2,
        "0"
      )}`;
  }
  return null;
}
function parseDateFromAnywhere(s, year = 2025) {
  const m1 = s.match(/(\d{1,2})\/(\d{1,2})\b/);
  if (m1) return `${year}-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
  const m2 = s.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})\b/i
  );
  if (m2) {
    const mm = monthToNum(m2[1]);
    if (mm)
      return `${year}-${String(mm).padStart(2, "0")}-${String(m2[2]).padStart(
        2,
        "0"
      )}`;
  }
  return null;
}

const AMOUNT_INLINE_RX = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/g;
const HEADER_RX =
  /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Deposits\s+and\s+Additions|Withdrawals\s+and\s+Subtractions|Account\s+summary|Daily\s+(?:ending|ledger)\s+balance|Ending\s+daily\s+balance|Daily\s+ledger\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i;

const PURCHASE_RX = /Purchase\s+authorized\s+on/i;
const BILL_RX =
  /(newrez|shellpoin|truist|progressive|pac-?life|dominion|virginia\s*natural\s*gas|tmobile|cox\s*comm|apple\.com\/bill|adobe|buzzsprout|discovery\+|netflix|hp\s*\*instant\s*ink|school\s*of\s*rock)/i;
const DEP_RX =
  /(pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|mobile\s*deposit|inst\s*xfer|vacp\s*treas|irs\s*treas|ssa|zelle)/i;
const HAS_CARD = /Card\s\d{4}/i;
const CODE_ONLY = /^(?:[SP]\d{6,}\s*)?Card\s\d{4}\s*$/i;

function analyzeStatementTextV3(txt) {
  const year = inferStatementYear(txt, 2025);
  const mOpen = txt.match(
    /Beginning\s+balance\s+on\s+\d{1,2}\/\d{1,2}\s+\$?\s*([0-9,]+\.\d{2})/i
  );
  const openingBalance = mOpen
    ? Number(mOpen[1].replace(/[^0-9.]/g, ""))
    : null;

  const lines = txt
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let curDate = null;
  let dateHeadersFound = 0;
  let descriptorCountWithAmt = 0;
  const missingAmountDescriptors = [];
  const eodSnapshots = []; // {date, balance, desc}

  const isCandidate = (ctx, line) =>
    PURCHASE_RX.test(ctx) ||
    BILL_RX.test(ctx) ||
    DEP_RX.test(ctx) ||
    (HAS_CARD.test(ctx) && !CODE_ONLY.test(line));

  // scan forward until next date line or a hard header, trying to find amounts
  function findAmountUntilNextDate(i, lines) {
    let j = i + 1;
    // build a rolling blob as we walk to also catch inline amounts spanning lines
    let blob = lines[i];
    while (j < lines.length) {
      const isoNext = dateAtLineStartToISO(lines[j], year);
      if (isoNext || HEADER_RX.test(lines[j])) break; // stop at next date section or a header
      // amount-only?
      if (AMT_ONLY_LINE.test(lines[j])) {
        const amt = Number(lines[j].replace(/[^0-9.]/g, ""));
        // check EOD as a second adjacent amount-only
        let hasBalanceNext = false;
        let eod = null;
        if (j + 1 < lines.length && AMT_ONLY_LINE.test(lines[j + 1])) {
          hasBalanceNext = true;
          eod = Number(lines[j + 1].replace(/[^0-9.]/g, ""));
        }
        return { amount: amt, idx: j, hasBalanceNext, eod };
      }
      // grow blob to catch inline amounts
      blob += " " + lines[j];
      j++;
    }
    // no amount-only found → try inline amounts in blob
    const amts = [...blob.matchAll(AMOUNT_INLINE_RX)].map((m) =>
      Number(m[1].replace(/,/g, ""))
    );
    if (amts.length >= 1) {
      const amount = amts[0];
      const eod = amts.length >= 2 ? amts[amts.length - 1] : null; // if two+, last is likely EOD
      return { amount, idx: null, hasBalanceNext: eod != null, eod };
    }
    return { amount: null, idx: null, hasBalanceNext: false, eod: null };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (HEADER_RX.test(line)) continue;

    const isoFromStart = dateAtLineStartToISO(line, year);
    if (isoFromStart) {
      curDate = isoFromStart;
      dateHeadersFound++;
    }

    const next = lines[i + 1] || "";
    const ctx = `${line} ${next}`;
    if (!isCandidate(ctx, line)) continue;

    const { amount, idx, hasBalanceNext, eod } = findAmountUntilNextDate(
      i,
      lines
    );
    if (amount != null) {
      descriptorCountWithAmt++;
      // capture inline EOD snapshot when available
      if (hasBalanceNext && eod != null) {
        const dateIso = curDate || parseDateFromAnywhere(ctx, year) || curDate;
        if (dateIso)
          eodSnapshots.push({ date: dateIso, balance: eod, desc: line });
      }
      if (idx != null) i = idx + (hasBalanceNext ? 1 : 0); // advance past consumed lines
    } else {
      const dateIso =
        curDate || parseDateFromAnywhere(ctx, year) || curDate || "unknown";
      missingAmountDescriptors.push({ date: dateIso, line });
    }
  }

  return {
    year,
    openingBalance,
    dateHeadersFound,
    descriptorCountWithAmt,
    missingAmountDescriptors,
    eodSnapshots,
  };
}

const toCents = (n) => Math.round(+n * 100);
const fromCents = (c) => +(c / 100).toFixed(2);

function computeDailyBalancesFromRows(rows, openingBalance, startIso, endIso) {
  // sum by date within range
  const by = new Map();
  for (const r of rows) {
    if (startIso && r.date < startIso) continue;
    if (endIso && r.date > endIso) continue;
    by.set(r.date, (by.get(r.date) || 0) + r.amount);
  }
  const days = Array.from(by.keys()).sort();
  const out = [];
  let bal = openingBalance;
  for (const d of days) {
    bal = +(bal + by.get(d)).toFixed(2);
    out.push({ date: d, balance: bal });
  }
  return out;
}

function reconcileToStatementTotals(rows, expectedIncome, expectedExpense) {
  // Compute current totals
  const EPS_C = 1; // <= 1 cent difference is “exact”

  const curIncC = rows
    .filter((r) => r.amount > 0)
    .reduce((s, r) => s + toCents(r.amount), 0);
  const curExpC = rows
    .filter((r) => r.amount < 0)
    .reduce((s, r) => s + toCents(-r.amount), 0);

  const expIncC = expectedIncome != null ? toCents(expectedIncome) : curIncC;
  const expExpC = expectedExpense != null ? toCents(expectedExpense) : curExpC;

  let incDeltaC = curIncC - expIncC;
  let expDeltaC = curExpC - expExpC;

  for (const r of rows)
    if (r.excludedFromTotals === undefined) r.excludedFromTotals = false;

  // If within a penny, treat as matched and bail
  if (Math.abs(incDeltaC) <= EPS_C && Math.abs(expDeltaC) <= EPS_C) {
    return { incDelta: 0, expDelta: 0, excluded: [] };
  }

  const excluded = [];
  const EPS = 0.01;

  // Helper to exclude a row
  const excludeRow = (r) => {
    r.excludedFromTotals = true;
    excluded.push({
      date: r.date,
      amount: r.amount,
      description: r.description,
    });
  };

  // ---- Handle expense overage (our expense too high) ----
  if (expDeltaC > 0) {
    let target = expDeltaC;

    // A) Prefer excluding internal transfers first (typical reconciliation difference)
    const INTERNAL_XFER_RX =
      /\bOnline\s+Transfer\s+to\b.*\bWells\s+Fargo\s+Clear\b/i;
    const internalTransfers = rows
      .filter(
        (r) =>
          r.amount < 0 &&
          !r.excludedFromTotals &&
          INTERNAL_XFER_RX.test(r.description)
      )
      // small to large so we try smaller ones first
      .sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));

    for (const r of internalTransfers) {
      const val = Math.abs(r.amount);
      if (Math.abs(target - val) <= EPS || val < target) {
        excludeRow(r);
        target = +(target - val).toFixed(2);
        if (Math.abs(target) <= EPS) return { incDeltaC, expDeltaC, excluded };
      }
    }

    // B) Try to match target with 1, 2, or 3 smallest expenses
    const expenses = rows
      .filter((r) => r.amount < 0 && !r.excludedFromTotals)
      .map((r) => ({ ref: r, abs: Math.abs(r.amount) }))
      .sort((a, b) => a.abs - b.abs);

    // Single
    for (const e of expenses) {
      if (Math.abs(e.abs - target) <= EPS) {
        excludeRow(e.ref);
        return { incDeltaC, expDeltaC, excluded };
      }
    }

    // Pair
    for (let i = 0; i < Math.min(expenses.length, 120); i++) {
      for (let j = i + 1; j < Math.min(expenses.length, 120); j++) {
        const s = +(expenses[i].abs + expenses[j].abs).toFixed(2);
        if (Math.abs(s - target) <= EPS) {
          excludeRow(expenses[i].ref);
          excludeRow(expenses[j].ref);
          return { incDeltaC, expDeltaC, excluded };
        }
      }
    }

    // Triple (120 smallest to keep it fast)
    for (let a = 0; a < Math.min(expenses.length, 120); a++) {
      for (let b = a + 1; b < Math.min(expenses.length, 120); b++) {
        for (let c = b + 1; c < Math.min(expenses.length, 120); c++) {
          const s = +(
            expenses[a].abs +
            expenses[b].abs +
            expenses[c].abs
          ).toFixed(2);
          if (Math.abs(s - target) <= EPS) {
            excludeRow(expenses[a].ref);
            excludeRow(expenses[b].ref);
            excludeRow(expenses[c].ref);
            return { incDeltaC, expDeltaC, excluded };
          }
        }
      }
    }
  }

  // ---- Handle income overage (not your case now, but symmetrical) ----
  if (incDeltaC > 0) {
    let target = incDeltaC;
    const DEPOSIT_STRONG =
      /\b(ibm\s*3141\s*payroll|leidos\s+inc\s+payroll|pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|mobile\s*deposit|branch\s*deposit|check\s*deposit|zelle\s*(from|credit)|online\s*transfer\s*from|xfer\s*from|ach\s*credit|credit\s+interest|interest\s+(payment|credit)|refund|reversal|return|vacp\s*treas|irs\s*treas|ssa)\b/i;

    const deposits = rows
      .filter((r) => r.amount > 0 && !r.excludedFromTotals)
      .map((r) => ({
        ref: r,
        abs: Math.abs(r.amount),
        looksDeposit: DEPOSIT_STRONG.test(r.description),
      }))
      .sort((a, b) => a.abs - b.abs);

    // Prefer non-strong (ambiguous) credits first
    const ordered = [
      ...deposits.filter((d) => !d.looksDeposit),
      ...deposits.filter((d) => d.looksDeposit),
    ];

    // Single
    for (const d of ordered) {
      if (Math.abs(d.abs - target) <= EPS) {
        excludeRow(d.ref);
        return { incDeltaC, expDeltaC, excluded };
      }
    }
  }

  return { incDeltaC, expDeltaC, excluded };
}

function fixTransfersAndSigns(rows) {
  const PAYROLL_RX =
    /\b(ibm\s*3141\s*payroll|leidos\s+inc\s+payroll|pay\s*roll)\b/i;

  for (const x of rows) {
    // Normalize any "Capital One Transfer ..." as an outgoing transfer (expense),
    // unless the description explicitly says "from".
    if (/^\s*Capital\s+One\s+Transfer\b/i.test(x.description)) {
      x.merchant = "Capital One Transfer";
      x.category = "Transfers";
      x.channel = "ach";
      if (!/\bfrom\b/i.test(x.description) && x.amount > 0)
        x.amount = -x.amount;
      if (/\bfrom\b/i.test(x.description) && x.amount < 0)
        x.amount = Math.abs(x.amount);
    }

    // Payroll should always be a deposit (positive)
    if (PAYROLL_RX.test(x.description)) {
      if (x.amount < 0) x.amount = Math.abs(x.amount);
      // keep your category mapping; you’d been bucketing income under "Transfers"
      // If you prefer a distinct "Income" category later, switch here.
    }
  }
}

// Read "Deposits/Additions" and "Withdrawals/Subtractions" from the PDF text
function extractStatementTotalsFromText(txt) {
  const dep = txt.match(/Deposits\/Additions\s+([$\s]*\d[\d,]*\.\d{2})/i);
  const wdr = txt.match(
    /Withdrawals\/Subtractions\s+-?\s*([$\s]*\d[\d,]*\.\d{2})/i
  );
  const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
  return {
    expectedIncome: dep ? num(dep[1]) : null,
    expectedExpense: wdr ? num(wdr[1]) : null, // positive value
  };
}

// Strip a leading date like "4/24 " or "Apr 24 "
function cleanDesc(s) {
  return s
    .replace(/^\s*\d{1,2}\/\d{1,2}\s+/, "")
    .replace(
      /^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}\s+/,
      ""
    );
}

const postDay = (iso) => Number(iso.split("-")[2]);

/** Canonical merchant + category */
const CANON = [
  [/newrez|shellpoin/i, "Newrez (Mortgage)"],
  [/truist\s*ln|auto\s*loan/i, "Truist Loan"],
  [/chase.*epay|chase\s*credit/i, "Chase Credit Card Payment"],
  [/capital\s*one.*pmt|cap\s*one.*payment/i, "Capital One Credit Card Payment"],
  [/dominion\s*energy/i, "Dominion Energy"],
  [/virginia\s*natural\s*gas|vng/i, "Virginia Natural Gas"],
  [/cox\s*comm/i, "Cox Communications"],
  [/t-?mobile/i, "T-Mobile"],
  [/hp.*instant\s*ink/i, "HP Instant Ink"],
  [/apple\.com\/bill/i, "Apple.com/Bill"],
  [/discovery\+|discovery plus/i, "Discovery+"],
  [/netflix/i, "Netflix"],
  [/progressive|prog\s*gulf\s*ins/i, "Progressive Insurance"],
  [/pac.*life|pac-?life-?lyn-?inf/i, "Pacific Life Insurance"],
  [/school\s*of\s*rock/i, "School of Rock"],
  [/harris\s*te(?:eter)?|harris\s*te\b/i, "Harris Teeter"],
  [/food\s*lion/i, "Food Lion"],
  [/target\b|target\s*t-\s*\d+/i, "Target"],
  [/chick-?fil-?a/i, "Chick-fil-A"],
  [/cinema\s*cafe/i, "Cinema Cafe"],
  [/amazon|amzn\.com\/bill|amazon\s*mktpl|prime\s*video/i, "Amazon"],
  [/bp#|shell\b|exxon|circle\s*k|7-?eleven|chevron/i, "Fuel Station"],
  [/paypal.*adobe/i, "Adobe"],
  [/adobe/i, "Adobe"],
  [/buzzsprout/i, "Buzzsprout"],
  [/ibm.*payroll/i, "IBM Payroll"],
  [/leidos.*payroll/i, "Leidos Payroll"],
];
const canonMerchant = (d, g) => CANON.find(([rx]) => rx.test(d))?.[1] ?? g;

function canonCategory(desc, merch) {
  const dl = desc.toLowerCase();
  if (/\b(payroll|edeposit|deposit|vacp\s*treas)\b/.test(dl))
    return "Transfers"; // income bucket
  if (merch === "Amazon") return "Amazon";
  if (merch === "Newrez (Mortgage)") return "Housing";
  if (merch === "Truist Loan") return "Debt";
  if (
    /(Dominion Energy|Virginia Natural Gas|T-Mobile|Cox Communications)/.test(
      merch ?? ""
    )
  )
    return "Utilities";
  if (/(Progressive Insurance|Pacific Life Insurance)/.test(merch ?? ""))
    return "Insurance";
  if (
    /(HP Instant Ink|Apple\.com\/Bill|Adobe|Buzzsprout|Discovery\+|Netflix)/.test(
      merch ?? ""
    )
  )
    return "Subscriptions";
  if (/(Harris Teeter|Food Lion)/.test(merch ?? "")) return "Groceries";
  if (/Chick-fil-A/.test(merch ?? "")) return "Dining";
  if (/Cinema Cafe/.test(merch ?? "")) return "Entertainment";
  if (/Target/.test(merch ?? "")) return "Shopping/Household";
  if (/Fuel Station/.test(merch ?? "")) return "Gas";
  if (/online\s*transfer|inst\s*xfer|xfer/.test(dl)) return "Transfers";
  return "Impulse/Misc";
}
const detectSpender = (desc, last4) =>
  last4 === "5280"
    ? "Mike"
    : last4 === "0161"
    ? "Beth"
    : /\bbeth\b/i.test(desc)
    ? "Beth"
    : /\bmicha|mike\b/i.test(desc)
    ? "Mike"
    : "Unknown";

function recurrenceKey(desc, merch) {
  if (merch) return merch.toLowerCase().replace(/\s+/g, "_");
  return desc
    .toLowerCase()
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/g, "")
    .replace(/card\s*\d{4}/g, "")
    .replace(/[\d\-\/\*\#]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, "_");
}

/** -------- parse a single PDF text into records -------- */
function extractRecordsFromText(txt) {
  const YEAR = 2025;

  // ---- normalize ----
  const lines = txt
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // ---- local constants/helpers ----
  const IS_DATE_SOLO = /^\d{1,2}\/\d{1,2}\s*$/; // “4/24”
  const DATE_AT_START = /^\d{1,2}\/\d{1,2}\b/; // line starts with MM/DD
  const AMT_ONLY = /^\$?\s*\d[\d,]*\.\d{2}\s*$/;
  const HEADER_RX =
    /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Deposits\s+and\s+Additions|Withdrawals\s+and\s+Subtractions|Account\s+summary|Daily\s+(?:ending|ledger)\s+balance|Ending\s+daily\s+balance|Daily\s+ledger\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i;

  const PURCHASE_RX =
    /^(?:\d{1,2}\/\d{1,2}\s+)?(?:Purchase|Recurring Payment)\s+.*authorized\s+on\s+\d{1,2}\/\d{1,2}/i;
  const CASHBACK_RX = /Purchase\s+with\s+Cash\s*Back/i;

  const BILL_RX =
    /(newrez|shellpoin|truist|chase|capital\s*one|progressive|pac-?life|dominion|virginia\s*natural\s*gas|tmobile|cox\s*comm|apple\.com\/bill|adobe|buzzsprout|discovery\+|netflix|hp\s*\*instant\s*ink)/i;
  const DEP_RX =
    /(pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|ach\s*credit|vacp\s*treas|inst\s*xfer|irs\s*treas|ssa|mobile\s*deposit|branch\s*deposit|zelle)/i;

  const HAS_CARD = /Card\s\d{4}/i;
  const CODE_ONLY = /^(?:[SP]\d{6,}\s*)?Card\s\d{4}\s*$/i;

  const lastInlineAmount = (s) => {
    const m = s.match(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g);
    if (!m || !m.length) return null;
    return Number(m[m.length - 1].replace(/[^0-9.]/g, ""));
  };
  const detectCardLast4 = (s) => s.match(/Card\s(\d{4})/i)?.[1] ?? "";
  const parseIsoFromMmdd = (mmdd, year = YEAR) => {
    const m = mmdd.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  };

  // find next amount-only, stopping at date/header (and date+descriptor)
  function findAmountAfter(idx) {
    for (let j = idx + 1; j < lines.length; j++) {
      const s = lines[j];
      if (IS_DATE_SOLO.test(s) || DATE_AT_START.test(s) || HEADER_RX.test(s)) {
        return { amount: null, idx: null, hasBalanceNext: false };
      }
      if (AMT_ONLY.test(s)) {
        const amount = Number(s.replace(/[^0-9.]/g, ""));
        const hasBalanceNext =
          j + 1 < lines.length && AMT_ONLY.test(lines[j + 1]);
        return { amount, idx: j, hasBalanceNext };
      }
    }
    return { amount: null, idx: null, hasBalanceNext: false };
  }

  let currentDateIso = null;
  const recs = [];
  const seen = new Set(); // dkey

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // capture the current posting date
    if (IS_DATE_SOLO.test(line)) {
      currentDateIso = parseIsoFromMmdd(line);
      continue;
    }

    // ignore obvious headers/tables
    if (HEADER_RX.test(line)) continue;

    // descriptor + possible leading date
    let descriptor = null;
    let dateIsoForThis = currentDateIso;

    if (DATE_AT_START.test(line) && PURCHASE_RX.test(line)) {
      const leadingDate = line.match(/^\d{1,2}\/\d{1,2}/)[0];
      dateIsoForThis = parseIsoFromMmdd(leadingDate);
      descriptor = line.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
    } else {
      descriptor = line;
    }

    if (AMT_ONLY.test(descriptor) || CODE_ONLY.test(descriptor)) continue;

    const next = lines[i + 1] || "";
    const ctx = `${descriptor} ${next}`;

    // --- SPECIAL CASE: “Purchase with Cash Back …” ---
    if (CASHBACK_RX.test(descriptor)) {
      const {
        amount: grossAmt,
        idx: amtIdx,
        hasBalanceNext,
      } = findAmountAfter(i);
      if (grossAmt != null) {
        const prev = lines[i - 1] || "";
        const next2 = lines[i + 1] || "";
        const ctx3 = `${prev} ${descriptor} ${next2}`;

        // "$ 60.00" or "$60" → 60.00
        const cbMatch = ctx3.match(
          /cash\s*back\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i
        );
        const cashback = cbMatch ? Number(cbMatch[1].replace(/,/g, "")) : 0;

        const last4 = (ctx3.match(/Card\s(\d{4})/i) || [])[1] || "";

        let merchantGuess = descriptor
          .replace(/.*authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/i, "")
          .replace(/Card\s\d{4}.*$/i, "")
          .replace(/\b[SP]\d{6,}\b.*$/i, "")
          .trim();

        const dateIso = dateIsoForThis || currentDateIso;
        if (dateIso) {
          const dkey = `${dateIso}|card_purchase|CB|${descriptor}|${last4}|${grossAmt.toFixed(
            2
          )}`;
          if (!seen.has(dkey)) {
            seen.add(dkey);
            recs.push({
              kind: "card_purchase",
              date: dateIso,
              description: descriptor, // cleaned later
              merchantGuess: merchantGuess || null,
              cardLast4: last4,
              amount: -grossAmt, // e.g., 161.13 (explode later)
              cashback, // e.g., 60.00
            });
          }
          if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
          continue; // handled
        }
      }
      // fall through if we didn’t find amount
    }

    // classify
    let kind = null;
    if (DEP_RX.test(ctx)) {
      kind = "deposit";
    } else if (
      BILL_RX.test(ctx) &&
      !/Purchase\s+.*authorized\s+on/i.test(descriptor)
    ) {
      kind = "billpay";
    } else if (
      PURCHASE_RX.test(ctx) ||
      (HAS_CARD.test(ctx) && !CODE_ONLY.test(descriptor)) ||
      /Target|Harris\s*Te|Food\s*Lion|Chick[- ]?Fil[- ]?A|Cinema\s*Caf[eé]|Amazon|Amzn\.com\/Bill/i.test(
        ctx
      )
    ) {
      kind = "card_purchase";
    } else {
      continue;
    }

    // normal amount selection
    let { amount: amt, idx: amtIdx, hasBalanceNext } = findAmountAfter(i);

    // deposit/billpay fallback: allow inline amount if no amount-only line
    if (amt == null && (kind === "deposit" || kind === "billpay")) {
      const inline = lastInlineAmount(ctx);
      if (inline != null) {
        amt = inline;
        amtIdx = null;
        hasBalanceNext = false;
      }
    }
    if (amt == null) continue;

    // prev+curr+next context for last4 + potential cashback text (rare outside special-case)
    const prevCtx = lines[i - 1] || "";
    const ctx3 = `${prevCtx} ${descriptor} ${next}`;
    const last4 = detectCardLast4(ctx3);

    const cbMatch = ctx3.match(
      /cash\s*back\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i
    );
    const cashback = cbMatch ? Number(cbMatch[1].replace(/,/g, "")) : 0;

    let merchantGuess = descriptor;
    if (/authorized\s+on\s+\d{1,2}\/\d{1,2}/i.test(merchantGuess)) {
      merchantGuess = merchantGuess.replace(
        /.*authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/i,
        ""
      );
    }
    merchantGuess = merchantGuess
      .replace(/Card\s\d{4}.*$/i, "")
      .replace(/\b[SP]\d{6,}\b.*$/i, "")
      .trim();

    const authCode =
      (descriptor.match(/\b[SP]\d{6,}\b/) ||
        next.match(/\b[SP]\d{6,}\b/) ||
        [])[0] || "";

    const dateIso = dateIsoForThis || currentDateIso;
    if (!dateIso) continue;

    const dkey = `${dateIso}|${kind}|${descriptor}|${authCode}|${last4}|${amt.toFixed(
      2
    )}`;
    if (seen.has(dkey)) {
      if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
      continue;
    }
    seen.add(dkey);

    recs.push({
      kind,
      date: dateIso,
      description: descriptor,
      merchantGuess: merchantGuess || null,
      cardLast4: last4,
      amount: kind === "deposit" ? amt : -amt,
      cashback,
    });

    if (amtIdx != null) {
      i = amtIdx + (hasBalanceNext ? 1 : 0);
    }
  }

  // Merge in cashback records (de-dupe by date|desc|amount)
  const cbRecs = extractCashbackRecordsFromText(txt, YEAR);
  if (cbRecs.length) {
    const seen2 = new Set(
      recs.map((r) => `${r.date}|${r.description}|${r.amount.toFixed(2)}`)
    );
    for (const r of cbRecs) {
      const k = `${r.date}|${r.description}|${r.amount.toFixed(2)}`;
      if (!seen2.has(k)) {
        recs.push(r);
        seen2.add(k);
      }
    }
  }
  return recs;
}

// Pull "Daily ending balance" table from a Wells PDF text
function extractDailyEndingBalancesFromText(txt) {
  const MON_IDX = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const OUT = [];
  // Find the "Daily ending balance" section first (to avoid summary tables)
  const sect = txt.split(/Daily\s+(?:ending|ledger)\s+balance/i)[1] || "";
  if (!sect) return OUT;

  // Pull month name alongside the number—simplify by scanning the section lines
  const LINES = sect
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const MONTH_RX = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i;

  for (const line of LINES) {
    const m1 = line.match(MONTH_RX);
    if (!m1) continue;
    // grab month and day
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const mon = parts[0].toLowerCase();
    const day = parts[1].match(/^\d{1,2}$/) ? Number(parts[1]) : null;
    const amt = (line.match(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/) || [])[0];
    if (!day || !amt) continue;
    const iso = `2025-${String(MON_IDX[mon]).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    OUT.push({ date: iso, balance: Number(amt.replace(/[^0-9.]/g, "")) });
  }
  return OUT;
}

// Build our own daily ending balances from parsed rows
function computeBalancesByDay(rows, openingBalance) {
  // Group by date (ISO), sum net
  const by = new Map();
  for (const r of rows) {
    const d = r.date;
    by.set(d, (by.get(d) || 0) + r.amount);
  }
  // Walk chronologically, accumulate from opening balance
  const days = Array.from(by.keys()).sort();
  const out = [];
  let bal = openingBalance;
  for (const d of days) {
    bal = +(bal + by.get(d)).toFixed(2);
    out.push({ date: d, balance: bal });
  }
  return out;
}

// Turn "Purchase with Cash Back $X" into TWO rows:
//  - adjusted purchase (amount = total - cashback)
//  - a separate cash-back row (category = "Cash Back", amount = cashback)
// Turn "Purchase with Cash Back $X" into TWO rows:
//  - adjusted purchase (amount = total - cashback)
//  - a separate cash-back row (category = "Cash Back", amount = cashback)
//
// IMPORTANT: Do the split whenever cashback > 0 AND amount < 0,
// regardless of channel (some PDF lines may come through as ACH by mistake).
function explodeCashbackRows(rows) {
  const out = [];
  for (const r of rows) {
    const cb = Number(r.cashback || 0);
    const isDebit = r.amount < 0;

    if (isDebit && cb > 0) {
      const total = Math.abs(r.amount);
      const cbCapped = Math.min(cb, total);
      const spendPortion = +(total - cbCapped).toFixed(2);

      // Only emit the (reduced) purchase row if there is anything left after cash-back
      if (spendPortion > 0) {
        out.push({
          ...r,
          amount: -spendPortion,
        });
      }

      // Always emit the separate cash-back row
      out.push({
        ...r,
        description: `${r.description} (Cash back $${cbCapped.toFixed(2)})`,
        amount: -cbCapped,
        category: "Cash Back",
        merchant: "Cash Back",
        channel: "cash",
        isRecurring: false,
        recurrenceKey: "cash_back",
      });
    } else {
      out.push(r);
    }
  }
  return out;
}

function mapRecordsToRows(records) {
  return records.map((r) => {
    const desc = cleanDesc(r.description); // keep your helper
    const merch = canonMerchant(desc, r.merchantGuess); // keep your helper
    const category = canonCategory(desc, merch); // keep your helper
    const spender = detectSpender(desc, r.cardLast4); // keep your helper

    const looksCardy =
      /Card\s*\d{4}/i.test(r.description) ||
      /authorized\s+on\s+\d{1,2}\/\d{1,2}/i.test(r.description);
    const channel =
      r.kind === "card_purchase" ||
      looksCardy ||
      (r.cardLast4 && r.cardLast4.length === 4)
        ? "card"
        : "ach";

    return {
      date: r.date,
      postDay: postDay(r.date), // keep your helper
      description: desc,
      amount: Number(r.amount.toFixed(2)),
      category,
      merchant: merch,
      channel,
      cardLast4: r.cardLast4,
      spender,
      accountId: "wells-checking",
      isRecurring: false, // your recurring pass runs later
      recurrenceKey: recurrenceKey(desc, merch), // keep your helper
      cashback: r.cashback || 0,
      excludedFromTotals: false,
    };
  });
}

function extractCashbackRecordsFromText(txt, year = 2025) {
  const L = txt
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Local regex (no globals)
  const IS_DATE_SOLO = /^\d{1,2}\/\d{1,2}\s*$/; // "4/24"
  const DATE_AT_START = /^\d{1,2}\/\d{1,2}\b/; // "4/24 Purchase …"
  const AMT_ONLY = /^\$?\s*\d[\d,]*\.\d{2}\s*$/;
  const HEADER_RX_LOCAL =
    /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Deposits\s+and\s+Additions|Withdrawals\s+and\s+Subtractions|Account\s+summary|Daily\s+(?:ending|ledger)\s+balance|Ending\s+daily\s+balance|Daily\s+ledger\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i;
  const CASHBACK_RX = /Purchase\s+with\s+Cash\s*Back\b/i;
  const AMOUNT_INLINE_RX = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/g;

  const parseIsoFromMmdd = (mmdd) => {
    const m = mmdd.match(/(\d{1,2})\/(\d{1,2})/);
    return m
      ? `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
      : null;
  };

  const out = [];
  let curDateIso = null;

  for (let i = 0; i < L.length; i++) {
    const line = L[i];

    // Track posting date from solo date lines
    if (IS_DATE_SOLO.test(line)) {
      curDateIso = parseIsoFromMmdd(line);
      continue;
    }

    if (!CASHBACK_RX.test(line)) continue;

    // ---- find gross amount (prefer amount-only before next date/header; else inline in a small blob)
    let gross = null,
      amtIdx = null,
      hasBalanceNext = false;

    // (a) scan forward safely
    for (let j = i + 1; j < L.length; j++) {
      const s = L[j];
      if (
        IS_DATE_SOLO.test(s) ||
        DATE_AT_START.test(s) ||
        HEADER_RX_LOCAL.test(s)
      )
        break;
      if (AMT_ONLY.test(s)) {
        gross = Number(s.replace(/[^0-9.]/g, ""));
        amtIdx = j;
        if (j + 1 < L.length && AMT_ONLY.test(L[j + 1])) {
          hasBalanceNext = true; // next is likely EOD balance
        }
        break;
      }
    }

    // (b) inline fallback: prev + curr + next (to catch "161.13    6,704.48")
    if (gross == null) {
      const blob = [L[i - 1] || "", line, L[i + 1] || ""].join(" ");
      const nums = [...blob.matchAll(AMOUNT_INLINE_RX)].map((m) =>
        Number(m[1].replace(/,/g, ""))
      );
      if (nums.length >= 1) gross = nums[0]; // first number is the txn
    }
    if (gross == null) continue;

    // pull cashback + last4 from tight context
    const ctx3 = `${L[i - 1] || ""} ${line} ${L[i + 1] || ""}`;
    const cbM = ctx3.match(
      /cash\s*back\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i
    );
    const cashback = cbM ? Number(cbM[1].replace(/,/g, "")) : 0;
    const last4 = (ctx3.match(/Card\s(\d{4})/i) || [])[1] || "";

    // posting date: header date if we have it; else from "authorized on"
    let dateIso = curDateIso;
    const mAuth = line.match(/authorized\s+on\s+(\d{1,2}\/\d{1,2})/i);
    if (!dateIso && mAuth) dateIso = parseIsoFromMmdd(mAuth[1]);
    if (!dateIso) continue;

    // merchant cleanup
    let merchantGuess = line
      .replace(/.*authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/i, "")
      .replace(/Card\s\d{4}.*$/i, "")
      .replace(/\b[SP]\d{6,}\b.*$/i, "")
      .trim();

    out.push({
      kind: "card_purchase",
      date: dateIso,
      description: line, // keep original descriptor
      merchantGuess: merchantGuess || null,
      cardLast4: last4,
      amount: -gross, // full gross (e.g., -161.13)
      cashback, // e.g., 60
    });

    // skip past consumed amount(s)
    if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
  }

  return out;
}

/** -------- main: read PDFs -> build seed JSON -------- */
async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("-o");
  if (outIdx === -1 || outIdx === args.length - 1) {
    console.error(
      "Usage: node scripts/make-seed-from-wells-pdfs.mjs <pdf1> <pdf2> ... -o <out.json>"
    );
    process.exit(1);
  }
  const out = args[outIdx + 1];
  const pdfs = args.slice(0, outIdx);

  // Validate each path and print what we're reading
  for (const p of pdfs) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) {
      console.error("❌ File not found:", abs);
      process.exit(1);
    }
    console.log("Reading:", abs);
  }

  let records = [];
  let expected = { income: 0, expense: 0, found: false };

  for (const p of pdfs) {
    const abs = path.resolve(p);
    const dataBuffer = fs.readFileSync(abs);
    console.log("Loaded bytes:", dataBuffer.length);
    const { text } = await pdfParse(dataBuffer);

    // parse transactions
    records = records.concat(extractRecordsFromText(text || ""));

    // Force-inject any “Purchase with Cash Back …” records the main pass missed
    const cbFound = extractCashbackRecordsFromText(text || "");

    // de-dupe: key by date|last4|gross
    const existingCbKeys = new Set(
      records
        .filter((r) => /Purchase\s+with\s+Cash\s*Back/i.test(r.description))
        .map(
          (r) =>
            `${r.date}|${r.cardLast4 || ""}|${Math.abs(r.amount).toFixed(2)}`
        )
    );

    const toAdd = cbFound.filter((r) => {
      const key = `${r.date}|${r.cardLast4 || ""}|${Math.abs(r.amount).toFixed(
        2
      )}`;
      return !existingCbKeys.has(key);
    });

    if (toAdd.length) {
      // console.log for sanity
      for (const r of toAdd) {
        console.log(`[cb] ${r.date} ${r.amount.toFixed(2)} ${r.description}`);
      }
      records = records.concat(toAdd);
    }

    // accumulate expected statement totals
    const t = extractStatementTotalsFromText(text || "");
    if (t.expectedIncome != null && t.expectedExpense != null) {
      expected.income += t.expectedIncome;
      expected.expense += t.expectedExpense;
      expected.found = true;
    }
  }

  // ... read PDFs + extractRecordsFromText for each ...
  let rows = mapRecordsToRows(records);
  rows = explodeCashbackRows(rows); // <-- split purchase − CB into two rows

  fixTransfersAndSigns(rows);

  // NEW — reconcile to statement totals (for the first PDF in this run)
  let expectedIncome = null,
    expectedExpense = null;
  try {
    const firstPdf = path.resolve(pdfs[0]);
    const txt0 = (await pdfParse(fs.readFileSync(firstPdf))).text || "";
    const mInc = txt0.match(/Deposits\/Additions\s+([$\s\d,]+\.\d{2})/i);
    const mExp = txt0.match(
      /Withdrawals\/Subtractions\s+[-–]?\s*([$\s\d,]+\.\d{2})/i
    );
    if (mInc) expectedIncome = Number(mInc[1].replace(/[^0-9.]/g, ""));
    if (mExp) expectedExpense = Number(mExp[1].replace(/[^0-9.]/g, ""));
  } catch (e) {}

  const recon = reconcileToStatementTotals(
    rows,
    expectedIncome,
    expectedExpense
  );

  // Recurring rules
  const ALLOW_RECUR_CATS = new Set([
    "Housing",
    "Utilities",
    "Insurance",
    "Subscriptions",
    "Debt",
    "Transfers",
    "Kids/School",
  ]);
  const EXCLUDE_MERCH = new Set([
    "Chase Credit Card Payment",
    "Capital One Credit Card Payment",
  ]);

  // group by key across months
  const monthsByKey = new Map();
  for (const x of rows) {
    const m = x.date.slice(0, 7);
    const set = monthsByKey.get(x.recurrenceKey) || new Set();
    set.add(m);
    monthsByKey.set(x.recurrenceKey, set);
  }
  const KNOWN_RECUR = new Set([
    "IBM Payroll",
    "Leidos Payroll",
    "Newrez (Mortgage)",
    "Progressive Insurance",
    "Pacific Life Insurance",
    "Cox Communications",
    "T-Mobile",
    "Dominion Energy",
    "Virginia Natural Gas",
    "HP Instant Ink",
    "Apple.com/Bill",
    "Adobe",
    "Buzzsprout",
    "Discovery+",
    "Netflix",
    "School of Rock",
  ]);

  for (const x of rows) {
    const monthsSeen = (monthsByKey.get(x.recurrenceKey) || new Set()).size;
    const merch = x.merchant || "";
    const okCat = ALLOW_RECUR_CATS.has(x.category);
    const base = monthsSeen >= 2 || KNOWN_RECUR.has(merch);
    x.isRecurring = Boolean(
      base && okCat && x.cashback <= 0 && !EXCLUDE_MERCH.has(merch)
    );
  }

  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  // Recompute totals EXCLUDING flagged rows
  const incomeC = rows
    .filter((r) => r.amount > 0 && !r.excludedFromTotals)
    .reduce((s, r) => s + toCents(r.amount), 0);

  const expenseC = rows
    .filter((r) => r.amount < 0 && !r.excludedFromTotals)
    .reduce((s, r) => s + toCents(-r.amount), 0);

  const income = fromCents(incomeC);
  const expense = fromCents(expenseC);

  const recurring = rows.filter(
    (r) => r.isRecurring && !r.excludedFromTotals
  ).length;
  const withCB = rows.filter(
    (r) => r.cashback > 0 && !r.excludedFromTotals
  ).length;

  console.log(`Wrote ${rows.length} rows → ${out}`);
  console.log(
    `Income ${income.toFixed(2)}  Expense ${expense.toFixed(
      2
    )}  Recurring ${recurring}  Cash-back rows ${withCB}`
  );
  if (recon.excluded.length) {
    console.log(
      "[reconcile] Excluded from totals (still in JSON with excludedFromTotals=true):"
    );
    for (const r of recon.excluded) {
      console.log(r.date, r.amount.toFixed(2), r.description);
    }
  }

  if (expected.found) {
    const di = +(income - expected.income).toFixed(2);
    const de = +(expense - expected.expense).toFixed(2);
    const ok = Math.abs(di) < 0.01 && Math.abs(de) < 0.01;

    // ---- GAP HUNTER (diagnostics) ----
    const { expectedIncome, expectedExpense } = extractStatementTotalsFromText(
      records.length
        ? (await pdfParse(fs.readFileSync(path.resolve(pdfs[0])))).text
        : ""
    );

    const expDelta = Number(
      (expense - (expectedExpense ?? expense)).toFixed(2)
    );
    const incDelta = Number((income - (expectedIncome ?? income)).toFixed(2));

    if (incDelta !== 0 || expDelta !== 0) {
      console.log(
        `[reconcile] Income Δ=${fromCents(incDelta).toFixed(
          2
        )}, Expense Δ=${fromCents(expDelta).toFixed(2)}`
      );

      // 1) Obvious suspects: summary/footer/fee lines that slipped through
      const SUSPECT_RX =
        /(Totals\b|Fee period\b|Ending daily balance|Daily ending balance|Daily ledger balance|Page\s+\d+\s+of\s+\d+)/i;
      const suspects = rows.filter((r) => SUSPECT_RX.test(r.description));
      if (suspects.length) {
        console.log("\n[reconcile] Suspect summary/footer rows:");
        for (const s of suspects)
          console.log(s.date, s.amount.toFixed(2), s.description);
      }
    }

    console.log(
      `Check vs statement → income Δ=${di}, expense Δ=${de}  ${
        ok ? "✅ OK" : "❌ MISMATCH"
      }`
    );

    // ---- DAILY BALANCE RECON ----
    try {
      // Read the single-PDF text you’re testing (May statement)
      const pdfPath = path.resolve(pdfs[0]);
      const { text: pdfText } = await pdfParse(fs.readFileSync(pdfPath));

      // 1) Extract statement daily ending balances
      const stmtBal = extractDailyEndingBalancesFromText(pdfText); // [{date, balance}]
      // Opening balance appears on the first page — try to scrape it:
      const openMatch = pdfText.match(
        /Beginning\s+balance\s+on\s+\d{1,2}\/\d{1,2}\s+\$?\s*([0-9,]+\.\d{2})/i
      );
      const openingBalance = openMatch
        ? Number(openMatch[1].replace(/[^0-9.]/g, ""))
        : null;

      if (stmtBal.length && openingBalance != null) {
        // 2) Build OUR daily balances
        const ourBal = computeBalancesByDay(rows, openingBalance); // [{date, balance}]

        // 3) Compare per day
        const stmtIdx = new Map(stmtBal.map((x) => [x.date, x.balance]));
        let firstDiff = null;
        for (const ob of ourBal) {
          const sb = stmtIdx.get(ob.date);
          if (sb == null) continue; // day not listed in pdf’s table
          const diff = +(ob.balance - sb).toFixed(2);
          if (diff !== 0) {
            firstDiff = { date: ob.date, ours: ob.balance, stmt: sb, diff };
            break;
          }
        }

        if (firstDiff) {
          console.log("\n[daily-balance] FIRST mismatch:");
          console.log(firstDiff);
          // print all our rows for that date to expose the culprit lines
          const dayRows = rows
            .filter((r) => r.date === firstDiff.date)
            .sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
          console.log(`[daily-balance] Transactions on ${firstDiff.date}:`);
          for (const r of dayRows)
            console.log(r.amount.toFixed(2), r.description);
        } else {
          console.log(
            "\n[daily-balance] Our daily balances match the PDF table for all common days."
          );
        }
      }
    } catch (e) {
      console.log("\n[daily-balance] Skipped (parse error):", e.message);
    }

    // ---- STATEMENT VERIFICATION (counts + inline EOD checks) ----
    try {
      const pdfPath = path.resolve(pdfs[0]);
      const { text: pdfText } = await pdfParse(fs.readFileSync(pdfPath));

      const ver = analyzeStatementTextV3(pdfText);
      console.log(
        `\n[verify] Beginning balance: ${
          ver.openingBalance != null
            ? `$${ver.openingBalance.toFixed(2)}`
            : "N/A"
        }`
      );
      console.log("[verify] Lines starting with a date:", ver.dateHeadersFound);
      console.log(
        "[verify] Transaction descriptors with amounts (from PDF text):",
        ver.descriptorCountWithAmt
      );
      console.log("[verify] Parsed rows written:", rows.length);

      // optional: compare inline snapshots to our computed per-day ledger
      if (ver.openingBalance != null && ver.eodSnapshots.length) {
        const lastPerDay = new Map();
        for (const s of ver.eodSnapshots) lastPerDay.set(s.date, s);
        const startIso = [...lastPerDay.keys()].sort()[0];
        const endIso = [...lastPerDay.keys()].sort().slice(-1)[0];

        const ourDaily = computeDailyBalancesFromRows(
          rows,
          ver.openingBalance,
          startIso,
          endIso
        );
        const ourMap = new Map(ourDaily.map((x) => [x.date, x.balance]));

        const mismatches = [];
        for (const [date, snap] of lastPerDay.entries()) {
          const ours = ourMap.get(date);
          if (typeof ours === "number") {
            const diff = +(ours - snap.balance).toFixed(2);
            if (diff !== 0)
              mismatches.push({
                date,
                ours,
                stmt: snap.balance,
                diff,
                desc: snap.desc,
              });
          }
        }
        if (mismatches.length) {
          console.log(
            "\n[verify] Daily EOD mismatches (ours vs inline snapshot):"
          );

          console.log(
            `First mismatch only -> ${
              mismatches[0].date
            } → ours ${mismatches[0].ours.toFixed(
              2
            )} vs stmt ${mismatches[0].stmt.toFixed(
              2
            )}  Δ=${mismatches[0].diff.toFixed(2)}  (${mismatches[0].desc})`
          );
        } else {
          console.log(
            "\n[verify] Our per-day ledger matches the inline end-of-day snapshots."
          );
        }
      } else {
        console.log(
          "\n[verify] No inline EOD snapshots found or missing opening balance; skipped EOD comparison."
        );
      }
    } catch (e) {
      console.log("\n[verify] Statement verification skipped:", e.message);
    }
  }
}

await main();
