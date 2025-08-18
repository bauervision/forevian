"use client";

import React, { useMemo, useState } from "react";
import {
  useReconciler,
  useReconcilerSelectors,
  type Transaction as CtxTransaction,
} from "@/app/providers/ReconcilerProvider";

import { useCategories } from "@/app/providers/CategoriesProvider";
import CategoryManagerDialog from "@/components/CategoryManagerDialog";
import { readOverrides, keyForTx, writeOverride } from "@/lib/overrides";

/* ──────────────────────────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────────────────────────── */

// add near other utils
const LS_KEY = "reconciler.cache.v1";
const LS_PREF_KEY = "reconciler.remember.v1";

type SnapshotFile = {
  stmtYear: number;
  pagesRaw: string[];
  inputs?: {
    beginningBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
};

// rebuild all transactions from a list of raw pages
function rebuildFromPages(
  pagesRaw: string[],
  stmtYear: number
): { txs: CtxTransaction[]; pageMeta: ImportedPage[] } {
  let all: CtxTransaction[] = [];
  const meta: ImportedPage[] = [];
  for (let i = pagesRaw.length - 1; i >= 0; i--) {
    const raw = pagesRaw[i];
    const { txs, unparsed } = parseAll(raw, stmtYear);
    const overrides = readOverrides();
    const mapped = txs
      .filter((t) => t.amount != null)
      .map((t, idx) => {
        const desc = t.description ?? "";
        const merch = canonMerchant(desc, null);
        const baseCat =
          t.tag === "cb_cashback" ? "Cash Back" : canonCategory(desc, merch);
        const displayDate = t.dateDisplay ?? isoToMMDD(t.date);

        const k = keyForTx(displayDate || "", desc, t.amount ?? 0);
        const categoryOverride = overrides[k];

        return {
          id: "temp",
          date: displayDate || "",
          description: desc,
          amount: t.amount ?? 0,
          category: baseCat,
          categoryOverride, // ← apply override if present
          raw: t.raw,
          notes: t.parseNotes.join("; "),
        };
      });
    all = [...all, ...mapped];
    meta.push({
      id: `${i}`,
      raw,
      txCount: mapped.length,
      unparsedCount: unparsed.length,
    });
  }
  // normalize ids and dedupe
  all = all.map((t, i) => ({ ...t, id: String(i) }));
  return { txs: dedupeTransactions(all), pageMeta: meta.reverse() };
}

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

function downloadCSV(
  rows: Array<Record<string, unknown>>,
  filename = "data.csv"
) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] ?? "";
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeDesc(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeTransactions(ts: CtxTransaction[]) {
  const seen = new Set<string>();
  const out: CtxTransaction[] = [];
  for (const t of ts) {
    const key = `${t.date}|${t.amount.toFixed(2)}|${normalizeDesc(
      t.description ?? ""
    )}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────────
   Canonical merchant + categories (ported from your script; trimmed for client)
   ────────────────────────────────────────────────────────────────────────────── */

const CANON: Array<[RegExp, string]> = [
  [/newrez|shellpoin/i, "Newrez (Mortgage)"],
  [/truist\s*ln|auto\s*loan/i, "Truist Loan"],
  [
    /\bchase\b.*\b(epay|e-?pay|card\s*payment|crd\s*epay)\b/i,
    "Chase Credit Card Payment",
  ],
  [
    /\b(capital\s*one|cap\s*one)\b.*\b(epay|e-?pay|card\s*payment|credit\s*card\s*pmt)\b/i,
    "Capital One Credit Card Payment",
  ],
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

function canonMerchant(desc: string, guess?: string | null) {
  const hit = CANON.find(([rx]) => rx.test(desc))?.[1];
  return hit ?? (guess || null);
}

function canonCategory(desc: string, merch?: string | null) {
  const m = merch ?? "";
  const dl = desc.toLowerCase();

  // Income / transfers in
  if (
    /\b(payroll|e\s*deposit|deposit|vacp\s*treas|ssa|irs\s*treas|ach\s*credit|zelle\s*(from|credit)|online\s*transfer\s*from|xfer\s*from|branch\s*deposit|mobile\s*deposit|credit\s*interest|interest\s*(payment|credit)|refund|reversal|return)\b/i.test(
      dl
    )
  )
    return "Income";

  // NEW: credit card payments are debt servicing (clearly a spend)
  if (
    m === "Chase Credit Card Payment" ||
    m === "Capital One Credit Card Payment"
  )
    return "Debt";

  // existing canon buckets…
  if (m === "Amazon") return "Amazon";
  if (m === "Newrez (Mortgage)") return "Housing";
  if (m === "Truist Loan") return "Debt";
  if (
    /(Dominion Energy|Virginia Natural Gas|T-Mobile|Cox Communications)/.test(m)
  )
    return "Utilities";
  if (/(Progressive Insurance|Pacific Life Insurance)/.test(m))
    return "Insurance";
  if (
    /(HP Instant Ink|Apple\.com\/Bill|Adobe|Buzzsprout|Discovery\+|Netflix|School of Rock)/.test(
      m
    )
  )
    return "Subscriptions";
  if (/(Harris Teeter|Food Lion)/.test(m)) return "Groceries";
  if (/Chick-fil-A/.test(m)) return "Dining";
  if (/Cinema Cafe/.test(m)) return "Entertainment";
  if (/Target/.test(m)) return "Shopping/Household";
  if (/Fuel Station/.test(m)) return "Gas";

  // fallbacks…
  if (/utility|electric|water|verizon|xfinity|comcast|duke energy/i.test(dl))
    return "Utilities";
  if (/amazon|walmart|target|costco|best buy|retail/i.test(dl))
    return "Shopping/Household";
  if (
    /restaurant|grill|cafe|bar|pizza|burger|brew|chipotle|starbucks/i.test(dl)
  )
    return "Dining";
  if (/grocery|kroger|aldi|publix|heb|whole foods/i.test(dl))
    return "Groceries";
  if (
    /airlines|uber|lyft|hotel|marriott|hilton|airbnb|southwest|delta/i.test(dl)
  )
    return "Travel";
  if (/atm/i.test(dl)) return "ATM";
  if (/fee|service charge|overdraft/i.test(dl)) return "Fees";
  if (/cash\s*back/i.test(dl)) return "Cash Back";
  return "Impulse/Misc";
}

/* ──────────────────────────────────────────────────────────────────────────────
   Parser (block aggregation + cash-back split + sign logic + MM/DD display)
   ────────────────────────────────────────────────────────────────────────────── */

type Tx = {
  id: string;
  raw: string;
  date?: string; // INTERNAL ISO (YYYY-MM-DD)
  dateDisplay?: string; // MM/DD for UI/export
  description?: string;
  amount?: number; // signed; >0 deposits, <0 withdrawals
  parseNotes: string[];
  tag?: "cb_spend" | "cb_cashback"; // to categorize precisely
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const IGNORE_PATTERNS = [
  /^total\s+deposits/i,
  /^total\s+withdrawals?/i,
  /^total\s+fees/i,
  /^ending\s+balance/i,
  /^beginning\s+balance/i,
  /^daily\s+(?:ending|ledger)\s+balance/i,
  /^page\s+\d+/i,
  /^statement\s+period/i,
];

const AMOUNT_LOOSE =
  /(?:\()?\$?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\$?\s*-?\d+\.\d{2}(?:\))?(?:\s*(CR|DR))?/i;

const CASHBACK_RX = /Purchase\s+with\s+Cash\s*Back\b/i;
const CB_VALUE_RX =
  /cash\s*back\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i;
const AUTH_ON_MMDD_RX = /authorized\s+on\s+(\d{1,2}\/\d{1,2})/i;

// Start a new block on date-only lines
const DATE_ONLY_PATTERNS: RegExp[] = [
  /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*$/, // 4/24, 04/24, 04/24/2025
  /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/, // 2025-04-24
  /^\s*(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s](\d{4})\s*$/i,
];

const CURRENCY_ONLY =
  /^\s*\(?\$?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?\s*(?:CR|DR)?\s*$|^\s*\$?\s*-?\d+\.\d{2}\s*(?:CR|DR)?\s*$/i;

function isDateOnlyLine(line: string) {
  return DATE_ONLY_PATTERNS.some((rx) => rx.test(line));
}
function isCurrencyOnlyLine(line: string) {
  return CURRENCY_ONLY.test(line) && !/[A-Za-z]/.test(line);
}

function toISO(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}
function isoToMMDD(iso?: string) {
  if (!iso) return "";
  const [, mm, dd] = iso.split("-");
  return `${mm}/${dd}`;
}

function toISODateFromMatch(
  line: string,
  fallbackYear: number
): { iso?: string; used?: string; display?: string } {
  const m1 = line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m1) {
    let yyyy = Number(m1[3]);
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000;
    return {
      iso: toISO(yyyy, Number(m1[1]), Number(m1[2])),
      used: m1[0],
      display: `${String(m1[1]).padStart(2, "0")}/${String(m1[2]).padStart(
        2,
        "0"
      )}`,
    };
  }
  const m2 = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2)
    return {
      iso: m2[0],
      used: m2[0],
      display: `${m2[1] ? m2[2] : ""}/${m2[3]}`,
    }; // fallback, we will recalc later
  const m3 = line.match(
    /\b(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s](\d{4})\b/i
  );
  if (m3) {
    const mon = MONTHS[m3[2].slice(0, 3).toLowerCase()];
    const iso = toISO(Number(m3[3]), mon, Number(m3[1]));
    return {
      iso,
      used: m3[0],
      display: `${String(mon).padStart(2, "0")}/${String(m3[1]).padStart(
        2,
        "0"
      )}`,
    };
  }
  const m4 = line.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m4) {
    const mm = Number(m4[1]),
      dd = Number(m4[2]);
    return {
      iso: toISO(fallbackYear, mm, dd),
      used: m4[0],
      display: `${String(mm).padStart(2, "0")}/${String(dd).padStart(2, "0")}`,
    };
  }
  return {};
}

function isCurrencyLike(token: string) {
  const t = token.replace(/[()\s]/g, "");
  if (/\d+\.\d{2}$/.test(t)) return true;
  if (/^\$?\d{1,3}(,\d{3})+(\.\d{2})?$/.test(t)) return true;
  if (/^\$/.test(t)) return true;
  if (/^\d{7,}$/.test(t)) return false;
  return false;
}

function extractRightmostAmount(line: string): {
  matched?: string;
  crdr?: string | null;
} {
  const re = new RegExp(AMOUNT_LOOSE.source, "ig");
  const rawMatches = [...line.matchAll(re)];
  if (!rawMatches.length) return {};
  type Candidate = {
    full: string;
    crdr: string | null;
    index: number;
    currencyLike: boolean;
  };
  const candidates: Candidate[] = rawMatches.map((m) => {
    const full = m[0];
    const crdr = full.match(/\b(CR|DR)\b/i)?.[1] ?? null;
    const index = m.index ?? 0;
    const currencyLike = isCurrencyLike(full);
    return { full, crdr, index, currencyLike };
  });
  const pool = candidates.filter((c) => c.currencyLike);
  const picked = (pool.length ? pool : candidates).reduce((a, b) =>
    a.index >= b.index ? a : b
  );
  return { matched: picked.full, crdr: picked.crdr };
}

function normalizeAmountToken(
  token: string,
  crdr?: string | null
): { value: number; notes: string[] } {
  const notes: string[] = [];
  let t = token.replace(/\$/g, "").trim();
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
    notes.push("parentheses → negative");
  }
  if (t.startsWith("-")) {
    sign = -1;
    t = t.slice(1);
    notes.push("leading '-' → negative");
  }
  const num = Number(t.replace(/,/g, ""));
  let value = sign * (isFinite(num) ? num : NaN);
  if (crdr) {
    const flag = crdr.toUpperCase();
    if (flag === "CR" && value < 0) {
      value *= -1;
      notes.push("CR → force positive");
    }
    if (flag === "DR" && value > 0) {
      value *= -1;
      notes.push("DR → force negative");
    }
  }
  return { value, notes };
}

/** Strong credit/debit cues */
const XFER_FROM_RX =
  /\b(online\s*)?(transfer|xfer|tfr|trf|trns?f(?:er)?)\s*(from|frm)\b/i;
const XFER_TO_RX =
  /\b(online\s*)?(transfer|xfer|tfr|trf|trns?f(?:er)?)\s*(to)\b/i;
const ZELLE_FROM_RX = /\bzelle\b.*\b(from|credit)\b/i;
const ZELLE_TO_RX = /\bzelle\b.*\b(to|payment)\b/i;
const ACH_CREDIT_RX = /\bach\s*credit\b/i;
const ACH_DEBIT_RX = /\bach\s*debit\b/i;
const PMT_RECEIVED_RX = /\b(payment\s*received|pmt\s*rcvd|thank\s*you)\b/i;
const REFUND_RX = /\b(refund|reversal|return)\b/i;
const INTEREST_CREDIT_RX =
  /\b(credit\s*interest|interest\s*(payment|credit))\b/i;

// NEW: government/benefit credits
const GOV_BENEFIT_RX =
  /\b(vacp\s*treas|us\s*treas|irs\s*treas|ssa|social\s*security|treasury)\b/i;

// NEW: clear debit cues for card/loan payments
const CARD_PAYMENT_RX =
  /\b(epay|e-?pay|card\s*payment|crd\s*epay|credit\s*card\s*pmt)\b/i;

function decideSignFromDesc(
  desc: string,
  amount: number,
  merchantGuess: string | null
) {
  if (amount < 0) return amount; // already negative (from token), keep it

  const d = desc.toLowerCase();

  // POSITIVE (credits)
  if (
    XFER_FROM_RX.test(d) ||
    ZELLE_FROM_RX.test(d) ||
    ACH_CREDIT_RX.test(d) ||
    PMT_RECEIVED_RX.test(d) ||
    REFUND_RX.test(d) ||
    INTEREST_CREDIT_RX.test(d) ||
    GOV_BENEFIT_RX.test(d) ||
    /\b(payroll|e\s*deposit|deposit|mobile\s*deposit|branch\s*deposit)\b/i.test(
      d
    )
  ) {
    return Math.abs(amount);
  }

  // NEGATIVE (debits)
  if (
    XFER_TO_RX.test(d) ||
    ZELLE_TO_RX.test(d) ||
    ACH_DEBIT_RX.test(d) ||
    CARD_PAYMENT_RX.test(d) ||
    /\b(withdrawal|purchase|pos|atm|debit|fee|payment\s*to|authorized|bill\s*pay|mortgage|loan\s*payment)\b/i.test(
      d
    ) ||
    !!merchantGuess // any recognized biller/merchant → spend
  ) {
    return -Math.abs(amount);
  }

  // Default: debit
  return -Math.abs(amount);
}

function buildDescriptionFallback(
  raw: string,
  usedDate?: string,
  amountToken?: string
) {
  let s = raw;
  if (usedDate) s = s.replace(usedDate, " ");
  if (amountToken) s = s.replace(amountToken, " ");
  s = s.replace(/\$?\s*-?\d{1,3}(?:,\d{3})*\.\d{2}/g, " ");
  s = s.replace(/\b\d{7,}\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || raw;
}

/** Group raw lines → logical blocks (drop trailing daily balance) */
function aggregateBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let buf: string[] = [];

  const flush = () => {
    if (!buf.length) return;
    const n = buf.length;
    if (
      n >= 2 &&
      isCurrencyOnlyLine(buf[n - 1]) &&
      isCurrencyOnlyLine(buf[n - 2])
    ) {
      buf = buf.slice(0, -1); // drop EOD balance
    }
    blocks.push(buf.slice());
    buf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isDateOnlyLine(line)) {
      flush();
      buf.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return blocks;
}

/** Parse one aggregated block; may emit 1 or 2 rows (cash-back split) */
function parseBlock(
  blockLines: string[],
  idx: number,
  statementYear: number
): Tx[] {
  const text = blockLines.join(" ");
  let usedDate: string | undefined;
  let dateIso: string | undefined;
  let dateDisplay: string | undefined;

  if (isDateOnlyLine(blockLines[0])) {
    const m = blockLines[0].match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (m) {
      const mm = Number(m[1]),
        dd = Number(m[2]);
      let yyyy = m[3] ? Number(m[3]) : statementYear;
      if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000;
      dateIso = toISO(yyyy, mm, dd);
      dateDisplay = `${String(mm).padStart(2, "0")}/${String(dd).padStart(
        2,
        "0"
      )}`;
      usedDate = m[0];
    }
  }
  if (!dateIso) {
    const d = toISODateFromMatch(text, statementYear);
    if (d.iso) {
      dateIso = d.iso;
      usedDate = d.used;
      dateDisplay = d.display ?? isoToMMDD(d.iso);
    }
  }
  if (!dateIso) {
    const ma = text.match(AUTH_ON_MMDD_RX);
    if (ma) {
      const [mm, dd] = ma[1].split("/");
      dateIso = toISO(statementYear, Number(mm), Number(dd));
      dateDisplay = `${String(mm).padStart(2, "0")}/${String(dd).padStart(
        2,
        "0"
      )}`;
      usedDate = ma[0];
    }
  }

  // amount (gross)
  let usedAmt: string | undefined;
  let amountRaw: number | undefined;
  const pick = extractRightmostAmount(text);
  if (pick.matched) {
    usedAmt = pick.matched;
    const n = normalizeAmountToken(pick.matched, pick.crdr);
    amountRaw = n.value;
  }

  // description
  let description = buildDescriptionFallback(text, usedDate, usedAmt);
  if (!description) description = text;

  // Canon merchant (for sign/category inference)
  const merch = canonMerchant(description, null);

  // CASH-BACK split
  if (
    CASHBACK_RX.test(text) &&
    typeof amountRaw === "number" &&
    isFinite(amountRaw)
  ) {
    const gross = Math.abs(amountRaw);
    const cbMatch = text.match(CB_VALUE_RX);
    const cb = cbMatch ? Number(cbMatch[1].replace(/,/g, "")) : 0;
    const cbCapped = Math.min(cb, gross);
    const spend = +(gross - cbCapped).toFixed(2);

    const base: Omit<Tx, "id"> = {
      raw: text,
      date: dateIso,
      dateDisplay,
      description,
      parseNotes: ["cash-back split"],
    };

    const out: Tx[] = [];
    if (spend > 0) {
      out.push({ ...base, id: `${idx}-a`, amount: -spend, tag: "cb_spend" });
    }
    if (cbCapped > 0) {
      out.push({
        ...base,
        id: `${idx}-b`,
        description: `${description} (Cash back $${cbCapped.toFixed(2)})`,
        amount: -cbCapped,
        tag: "cb_cashback",
        parseNotes: ["cash-back portion"],
      });
    }
    return out;
  }

  // Non-cashback
  if (!(typeof amountRaw === "number" && isFinite(amountRaw))) {
    return [
      {
        id: `${idx}`,
        raw: text,
        date: dateIso,
        dateDisplay,
        description,
        parseNotes: ["no parseable amount"],
      },
    ];
  }

  // If amount has no clear sign, decide from description/merchant (default to debit)
  const signed = decideSignFromDesc(description, amountRaw, merch ?? null);
  return [
    {
      id: `${idx}`,
      raw: text,
      date: dateIso,
      dateDisplay,
      description,
      amount: signed,
      parseNotes: [],
    },
  ];
}

function parseAll(
  raw: string,
  statementYear: number
): { txs: Tx[]; unparsed: Tx[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !IGNORE_PATTERNS.some((rx) => rx.test(s)));

  const blocks = aggregateBlocks(lines);
  const txs = blocks.flatMap((b, bi) => parseBlock(b, bi, statementYear));
  const unparsed = txs.filter((t) => t.amount === undefined);
  return { txs, unparsed };
}

/* ──────────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────────── */

type ImportedPage = {
  id: string;
  raw: string;
  txCount: number;
  unparsedCount: number;
};

export default function Page() {
  const { setTransactions, setUserInputs, setSettings, resetAll } =
    useReconciler();
  const { totals, discrepancies, flags, inputs, settings, transactions } =
    useReconcilerSelectors();

  // Statement year (for MM/DD lines)
  const [stmtYear, setStmtYear] = useState<number>(new Date().getFullYear());

  // Multi-page paste
  const [pageRaw, setPageRaw] = useState("");
  const [pages, setPages] = useState<ImportedPage[]>([]);

  // User numbers
  const [begBal, setBegBal] = useState(inputs.beginningBalance ?? 0);
  const [userDeps, setUserDeps] = useState(inputs.totalDeposits ?? 0);
  const [userWds, setUserWds] = useState(inputs.totalWithdrawals ?? 0);

  // after existing useState hooks:
  const [remember, setRemember] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(LS_PREF_KEY) !== "0";
  });

  // auto-restore on first mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as SnapshotFile;
      if (!snap || !Array.isArray(snap.pagesRaw) || !snap.pagesRaw.length)
        return;

      setStmtYear(snap.stmtYear || new Date().getFullYear());

      // optional: restore user inputs if present
      if (snap.inputs) {
        setBegBal(snap.inputs.beginningBalance ?? 0);
        setUserDeps(snap.inputs.totalDeposits ?? 0);
        setUserWds(snap.inputs.totalWithdrawals ?? 0);
        setUserInputs({
          beginningBalance: snap.inputs.beginningBalance ?? 0,
          totalDeposits: snap.inputs.totalDeposits ?? 0,
          totalWithdrawals: snap.inputs.totalWithdrawals ?? 0,
        });
      }

      const { txs, pageMeta } = rebuildFromPages(
        snap.pagesRaw,
        snap.stmtYear || new Date().getFullYear()
      );
      setTransactions(txs);
      setPages(pageMeta);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-save whenever pages/year/inputs change
  React.useEffect(() => {
    if (!remember) return;
    const payload: SnapshotFile = {
      stmtYear,
      pagesRaw: pages.map((p) => p.raw),
      inputs: {
        beginningBalance: inputs.beginningBalance ?? begBal ?? 0,
        totalDeposits: inputs.totalDeposits ?? userDeps ?? 0,
        totalWithdrawals: inputs.totalWithdrawals ?? userWds ?? 0,
      },
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      localStorage.setItem(LS_PREF_KEY, remember ? "1" : "0");
    } catch {}
  }, [pages, stmtYear, inputs, begBal, userDeps, userWds, remember]);

  function addPage() {
    if (!pageRaw.trim()) return;
    const { txs, unparsed } = parseAll(pageRaw, stmtYear);

    const offset = transactions.length;
    const mapped: CtxTransaction[] = txs
      .filter((t) => t.amount != null)
      .map((t, i) => {
        const rawDesc = t.description ?? "";
        // Canon merchant + category
        const merch = canonMerchant(rawDesc, null);
        let category =
          t.tag === "cb_cashback" ? "Cash Back" : canonCategory(rawDesc, merch);

        // MM/DD display only
        const displayDate = t.dateDisplay ?? isoToMMDD(t.date);

        return {
          id: String(offset + i),
          date: displayDate || "", // UI wants MM/DD
          description: rawDesc,
          amount: t.amount ?? 0,
          category,
          raw: t.raw,
          notes: t.parseNotes.join("; "),
        };
      });

    setTransactions(dedupeTransactions([...transactions, ...mapped]));

    setPages((prev) => [
      {
        id: (
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
        ).toString(),
        raw: pageRaw,
        txCount: mapped.length,
        unparsedCount: unparsed.length,
      },
      ...prev,
    ]);
    setPageRaw("");
  }

  function removePage(id: string) {
    const remaining = pages.filter((p) => p.id !== id);
    let all: CtxTransaction[] = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const { txs } = parseAll(remaining[i].raw, stmtYear);
      const mapped = txs
        .filter((t) => t.amount != null)
        .map((t) => {
          const rawDesc = t.description ?? "";
          const merch = canonMerchant(rawDesc, null);
          const category =
            t.tag === "cb_cashback"
              ? "Cash Back"
              : canonCategory(rawDesc, merch);

          const displayDate = t.dateDisplay ?? isoToMMDD(t.date);

          return {
            id: "temp",
            date: displayDate || "",
            description: rawDesc,
            amount: t.amount ?? 0,
            category,
            raw: t.raw,
            notes: t.parseNotes.join("; "),
          };
        });
      all = [...all, ...mapped];
    }
    all = all.map((t, i) => ({ ...t, id: String(i) }));
    setTransactions(dedupeTransactions(all));
    setPages(remaining);
  }

  function applyUserNumbers() {
    setUserInputs({
      beginningBalance: Number.isFinite(+begBal) ? +begBal : 0,
      totalDeposits: Number.isFinite(+userDeps) ? +userDeps : 0,
      totalWithdrawals: Number.isFinite(+userWds) ? +userWds : 0,
    });
  }

  const endingDelta =
    discrepancies.endingBalance == null
      ? null
      : Math.abs(discrepancies.endingBalance);

  const allGood =
    (flags.depositOk ?? true) &&
    (flags.withdrawalOk ?? true) &&
    (flags.endingOk ?? true) &&
    transactions.length > 0;

  // Category summary
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      const k = t.category ?? "Uncategorized";
      m.set(k, (m.get(k) ?? 0) + t.amount);
    }
    return Array.from(m.entries()).sort(
      (a, b) => Math.abs(b[1]) - Math.abs(a[1])
    );
  }, [transactions]);

  // Running balance
  const rowsWithRunning = useMemo(() => {
    const start = inputs.beginningBalance ?? 0;
    let run = start;
    return transactions.map((t) => {
      run += t.amount;
      return { ...t, running: run };
    });
  }, [transactions, inputs.beginningBalance]);

  function finalizeReconciliation() {
    const summary = [
      {
        beginningBalance: inputs.beginningBalance ?? "",
        parsedDeposits: totals.depositTotal.toFixed(2),
        parsedWithdrawals: totals.withdrawalTotalAbs.toFixed(2),
        computedEnding:
          totals.endingBalance == null ? "" : totals.endingBalance.toFixed(2),
      },
    ];
    downloadCSV(summary, "reconciliation-summary.csv");

    downloadCSV(
      transactions.map((t) => ({
        date: t.date, // MM/DD
        description: t.description,
        category: t.category ?? "",
        amount: t.amount.toFixed(2),
        raw: t.raw ?? "",
        notes: t.notes ?? "",
      })),
      "reconciled-transactions.csv"
    );

    const snapshot = {
      statementYear: stmtYear,
      inputs,
      totals,
      discrepancies,
      transactions,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconciliation-snapshot.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // after you read inputs/totals/transactions from context
  const depDelta = useMemo(() => {
    if (inputs.totalDeposits == null) return 0;
    return +(totals.depositTotal - inputs.totalDeposits).toFixed(2); // parsed - user (your UI format)
  }, [totals.depositTotal, inputs.totalDeposits]);

  const wdrDelta = useMemo(() => {
    if (inputs.totalWithdrawals == null) return 0;
    return +(totals.withdrawalTotalAbs - inputs.totalWithdrawals).toFixed(2); // parsed - user
  }, [totals.withdrawalTotalAbs, inputs.totalWithdrawals]);

  // when these are equal & opposite, we likely mis-signed items totaling this magnitude
  const suspectDelta = useMemo(() => {
    const tol = 0.01;
    if (Math.abs(depDelta + wdrDelta) <= tol && Math.abs(depDelta) > tol) {
      return Math.abs(depDelta);
    }
    return 0;
  }, [depDelta, wdrDelta]);

  const mismatchCandidates = useMemo(() => {
    if (!suspectDelta) return [];
    const tol = 0.01;
    const amb =
      /(transfer|xfer|tfr|zelle|ach|refund|reversal|return|interest|payment\s*received|thank\s*you)/i;
    // Look for a single row whose abs(amount) ≈ suspectDelta and looks ambiguous
    return transactions
      .filter(
        (t) =>
          Math.abs(Math.abs(t.amount) - suspectDelta) <= tol &&
          amb.test(t.description ?? "")
      )
      .slice(0, 10);
  }, [transactions, suspectDelta]);

  function flipSign(id: string) {
    const updated = transactions.map((t) =>
      t.id === id ? { ...t, amount: -t.amount } : t
    );
    setTransactions(updated);
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function rerunParsing() {
    const pagesRaw = pages.map((p) => p.raw);
    const { txs, pageMeta } = rebuildFromPages(pagesRaw, stmtYear);
    setTransactions(txs);
    setPages(pageMeta);
  }

  function exportSnapshot() {
    const snap: SnapshotFile = {
      stmtYear,
      pagesRaw: pages.map((p) => p.raw),
      inputs: {
        beginningBalance: inputs.beginningBalance ?? begBal ?? 0,
        totalDeposits: inputs.totalDeposits ?? userDeps ?? 0,
        totalWithdrawals: inputs.totalWithdrawals ?? userWds ?? 0,
      },
    };
    const blob = new Blob([JSON.stringify(snap, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconciler-pages-snapshot.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importSnapshot(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const snap = JSON.parse(String(reader.result)) as SnapshotFile;
        if (snap && Array.isArray(snap.pagesRaw)) {
          setStmtYear(snap.stmtYear || new Date().getFullYear());
          if (snap.inputs) {
            setBegBal(snap.inputs.beginningBalance ?? 0);
            setUserDeps(snap.inputs.totalDeposits ?? 0);
            setUserWds(snap.inputs.totalWithdrawals ?? 0);
            setUserInputs({
              beginningBalance: snap.inputs.beginningBalance ?? 0,
              totalDeposits: snap.inputs.totalDeposits ?? 0,
              totalWithdrawals: snap.inputs.totalWithdrawals ?? 0,
            });
          }
          const { txs, pageMeta } = rebuildFromPages(
            snap.pagesRaw,
            snap.stmtYear || new Date().getFullYear()
          );
          setTransactions(txs);
          setPages(pageMeta);
        }
      } catch {}
      e.target.value = ""; // reset for next import
    };
    reader.readAsText(f);
  }

  function clearLocalCopy() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }

  const currency = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  const withdrawals = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) < 0),
    [transactions]
  );
  const deposits = React.useMemo(
    () => transactions.filter((t) => (t.amount ?? 0) > 0),
    [transactions]
  );

  // group withdrawals by date
  const groups = React.useMemo(() => {
    const m = new Map<string, { rows: typeof transactions; total: number }>();
    for (const t of withdrawals) {
      const k = t.date || "";
      const g = m.get(k) ?? { rows: [], total: 0 };
      g.rows.push(t);
      g.total += Math.abs(t.amount);
      m.set(k, g);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [withdrawals]);

  const [openDate, setOpenDate] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    // default newly-seen dates to open
    setOpenDate((prev) => {
      const next = { ...prev };
      for (const [d] of groups) if (!(d in next)) next[d] = true;
      return next;
    });
  }, [groups]);

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    for (const [d] of groups) all[d] = true;
    setOpenDate(all);
  };
  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    for (const [d] of groups) all[d] = false;
    setOpenDate(all);
  };

  /* ───────────────────────────────────────── UI ───────────────────────────────────────── */

  const CATEGORY_ADD_SENTINEL = "__ADD__";

  function CategorySelect({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) {
    const { categories } = useCategories();
    const [openMgr, setOpenMgr] = React.useState(false);

    const sorted = React.useMemo(() => {
      const list = [...categories].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
      // push "Uncategorized" to end if present
      const i = list.findIndex((x) => x.toLowerCase() === "uncategorized");
      if (i >= 0) {
        list.splice(i, 1);
        list.push("Uncategorized");
      }
      return list;
    }, [categories]);

    return (
      <>
        <select
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CATEGORY_ADD_SENTINEL) {
              setOpenMgr(true);
              return;
            }
            onChange(v);
          }}
          className="bg-white text-gray-700 border border-gray-300 rounded px-2 py-1
                   placeholder-gray-400 dark:bg-white dark:text-gray-700"
        >
          {sorted.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={CATEGORY_ADD_SENTINEL}>＋ Add Category…</option>
        </select>
        <CategoryManagerDialog
          open={openMgr}
          onClose={() => setOpenMgr(false)}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pasted Statement Reconciler</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={resetAll}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Clear context and local storage"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Statement year + multi-page paste */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-end gap-4">
            <label className="block">
              <span className="text-sm">
                Statement year (for dates like MM/DD)
              </span>
              <input
                type="number"
                className="mt-1 w-28 rounded border px-2 py-2 dark:bg-gray-900 dark:text-gray-100"
                value={stmtYear}
                onChange={(e) =>
                  setStmtYear(
                    Number(e.target.value || new Date().getFullYear())
                  )
                }
              />
            </label>
          </div>

          <label className="block text-sm font-medium mt-2">
            Paste a page of transactions
          </label>
          <textarea
            className="w-full h-48 rounded-lg border p-3 font-mono text-sm dark:bg-gray-900 dark:text-gray-100"
            placeholder={`Paste one statement page here, then click Add Page.\nWe’ll clear this box so you can paste the next page.`}
            value={pageRaw}
            onChange={(e) => setPageRaw(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={addPage}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Add Page
            </button>
            <button
              onClick={() => setPageRaw("")}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Clear
            </button>
          </div>
          <p className="text-xs text-gray-500">
            We group multi-line entries, drop daily-balance lines, and split
            “Purchase with Cash Back” correctly.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Imported pages</div>

          <div className="flex flex-wrap gap-2 items-center mb-2">
            <button
              onClick={rerunParsing}
              className="rounded border px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Re-parse all saved pages with the current parser"
            >
              Re-run parsing
            </button>
            <button
              onClick={exportSnapshot}
              className="rounded border px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Download a JSON snapshot (includes raw pages)"
            >
              Export snapshot
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded border px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Load a previously exported JSON snapshot"
            >
              Import snapshot
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={importSnapshot}
            />
            <label className="ml-auto inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember on this device
            </label>
            <button
              onClick={clearLocalCopy}
              className="rounded border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Delete the cached pages from this browser"
            >
              Clear local copy
            </button>
          </div>

          {/* existing list of pages below stays the same */}
          {pages.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              No pages yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {pages.map((p, idx) => (
                <li
                  key={p.id}
                  className="rounded border p-3 flex items-center justify-between"
                >
                  <div className="text-sm">
                    <div className="font-medium">Page {pages.length - idx}</div>
                    <div className="text-gray-600 dark:text-gray-300">
                      Parsed: <strong>{p.txCount}</strong>, Needs attention:{" "}
                      <strong>{p.unparsedCount}</strong>
                    </div>
                  </div>
                  <button
                    className="text-sm px-2 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => removePage(p.id)}
                    title="Remove this page and rebuild"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* User-provided numbers */}
      <section className="grid sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-sm">Beginning balance</span>
          <input
            className="mt-1 w-full rounded border p-2 dark:bg-gray-900 dark:text-gray-100"
            type="number"
            step="0.01"
            value={begBal}
            onChange={(e) => setBegBal(+e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm">Total deposits (user)</span>
          <input
            className="mt-1 w-full rounded border p-2 dark:bg-gray-900 dark:text-gray-100"
            type="number"
            step="0.01"
            value={userDeps}
            onChange={(e) => setUserDeps(+e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm">Total withdrawals (user)</span>
          <input
            className="mt-1 w-full rounded border p-2 dark:bg-gray-900 dark:text-gray-100"
            type="number"
            step="0.01"
            value={userWds}
            onChange={(e) => setUserWds(+e.target.value)}
          />
        </label>

        <div className="sm:col-span-3 flex items-center gap-3">
          <label className="block">
            <span className="text-sm">Tolerance (cents)</span>
            <input
              type="number"
              className="mt-1 w-28 rounded border px-2 py-2 dark:bg-gray-900 dark:text-gray-100"
              value={settings.toleranceCents}
              onChange={(e) =>
                setSettings({ toleranceCents: Number(e.target.value) })
              }
              min={0}
            />
          </label>
          <button
            onClick={applyUserNumbers}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Apply user numbers to reconciliation"
          >
            Apply numbers
          </button>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid md:grid-cols-3 gap-4">
        <SummaryCard
          title="Parsed Deposits"
          value={currency(totals.depositTotal)}
          status={
            flags.depositOk == null ? "na" : flags.depositOk ? "ok" : "warn"
          }
          subtitle={
            inputs.totalDeposits != null
              ? `User: ${currency(inputs.totalDeposits)}`
              : "User: —"
          }
          delta={
            discrepancies.deposits == null
              ? undefined
              : `Δ ${currency(discrepancies.deposits)}`
          }
        />
        <SummaryCard
          title="Parsed Withdrawals"
          value={currency(totals.withdrawalTotalAbs)}
          status={
            flags.withdrawalOk == null
              ? "na"
              : flags.withdrawalOk
              ? "ok"
              : "warn"
          }
          subtitle={
            inputs.totalWithdrawals != null
              ? `User: ${currency(inputs.totalWithdrawals)}`
              : "User: —"
          }
          delta={
            discrepancies.withdrawals == null
              ? undefined
              : `Δ ${currency(discrepancies.withdrawals)}`
          }
        />
        <SummaryCard
          title="Ending Balance"
          value={
            totals.endingBalance == null ? "—" : currency(totals.endingBalance)
          }
          status={
            flags.endingOk == null ? "na" : flags.endingOk ? "ok" : "error"
          }
          subtitle={(() => {
            if (
              inputs.beginningBalance == null ||
              inputs.totalDeposits == null ||
              inputs.totalWithdrawals == null
            )
              return "User: —";
            const userEnding =
              inputs.beginningBalance +
              inputs.totalDeposits -
              inputs.totalWithdrawals;
            return `User: ${currency(userEnding)}`;
          })()}
          delta={endingDelta == null ? undefined : `Δ ${currency(endingDelta)}`}
        />
      </section>

      {/* Category summary */}
      <section className="rounded border p-4">
        <h3 className="font-semibold mb-2">By Category</h3>
        {byCategory.length === 0 ? (
          <div className="text-sm text-gray-500">No data.</div>
        ) : (
          <ul className="text-sm grid sm:grid-cols-2 gap-x-6">
            {byCategory.map(([cat, sum]) => (
              <li
                key={cat}
                className="flex items-center justify-between py-1 border-b border-dashed border-gray-200 dark:border-gray-800"
              >
                <span className="text-gray-800 dark:text-gray-200">{cat}</span>
                <span
                  className={
                    sum < 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-emerald-700 dark:text-emerald-400"
                  }
                >
                  {currency(sum)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Diagnostics */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Diagnostics</h2>
        <ul className="text-sm space-y-2">
          <li>
            Transactions parsed: <strong>{transactions.length}</strong>
          </li>
          {flags.depositOk === false && (
            <li className="text-amber-600">
              ⚠️ Deposits mismatch. Check for missed/duplicated entries or page
              summaries being pasted.
            </li>
          )}
          {flags.withdrawalOk === false && (
            <li className="text-amber-600">
              ⚠️ Withdrawals mismatch. Double-check pasted pages.
            </li>
          )}
          {flags.endingOk === false && endingDelta != null && (
            <li className="text-red-600">
              ❌ Ending balance discrepancy of {currency(endingDelta)}{" "}
              (tolerance ${(settings.toleranceCents / 100).toFixed(2)}). Check
              for missing/extra transactions or sign errors.
            </li>
          )}
          {flags.endingOk &&
            flags.depositOk &&
            flags.withdrawalOk &&
            transactions.length > 0 && (
              <li className="text-emerald-700">
                ✅ Everything lines up. Click{" "}
                <strong>Finalize Reconciliation</strong> to export your report.
              </li>
            )}
        </ul>

        {suspectDelta > 0 && (
          <li className="text-blue-700 dark:text-blue-300">
            🔎 Deposits and withdrawals deltas are equal and opposite. This
            usually means a credit was signed as a debit. Look for amount ≈{" "}
            <strong>{currency(suspectDelta)}</strong>.
          </li>
        )}
        {mismatchCandidates.length > 0 && (
          <li className="text-sm">
            Likely sign-error candidates:
            <ul className="mt-1 space-y-1">
              {mismatchCandidates.map((t) => (
                <li
                  key={`cand-${t.id}`}
                  className="flex items-center justify-between gap-3 border rounded px-2 py-1"
                >
                  <div className="truncate">
                    <span className="mr-2 font-mono">{t.date}</span>
                    <span className="mr-2">{t.description}</span>
                    <span
                      className={
                        t.amount < 0
                          ? "text-red-700 dark:text-red-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }
                    >
                      {currency(t.amount)}
                    </span>
                  </div>
                  <button
                    className="text-xs rounded border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => flipSign(t.id)}
                    title="Flip this transaction's sign"
                  >
                    Flip sign
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
      </section>

      {/* Table */}
      <section className="rounded border p-4 mt-6">
        <h3 className="font-semibold mb-3">Deposits</h3>
        {deposits.length === 0 ? (
          <div className="text-sm text-gray-500">No deposits.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-2 w-20">Date</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((t) => (
                <tr key={`dep-${t.id}`} className="border-t">
                  <td className="p-2">{t.date}</td>
                  <td className="p-2">{t.description}</td>
                  <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">
                    {currency(t.amount)}
                  </td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="p-2" colSpan={2}>
                  Total
                </td>
                <td className="p-2 text-right">
                  {currency(deposits.reduce((s, r) => s + (r.amount ?? 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Controls */}
      <div className="flex gap-2 mb-2">
        <button
          className="text-xs border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={expandAll}
        >
          Expand all
        </button>
        <button
          className="text-xs border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={collapseAll}
        >
          Collapse all
        </button>
      </div>

      {/* Groups */}
      <div className="rounded border divide-y">
        {groups.map(([date, g]) => (
          <div key={date}>
            <button
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => setOpenDate((s) => ({ ...s, [date]: !s[date] }))}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{date}</span>
                <span className="text-xs text-gray-500">
                  ({g.rows.length} tx)
                </span>
              </div>
              <div className="text-sm">
                Day total:{" "}
                <span className="font-medium text-red-700 dark:text-red-400">
                  {currency(g.total)}
                </span>
              </div>
            </button>

            {openDate[date] && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="text-left p-2 w-1/2">Description</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2">{t.description}</td>
                      <td className="p-2">
                        <CategorySelect
                          value={
                            t.categoryOverride ?? t.category ?? "Uncategorized"
                          }
                          onChange={(val) => {
                            const k = keyForTx(
                              t.date || "",
                              t.description || "",
                              t.amount ?? 0
                            );
                            writeOverride(k, val);
                            setTransactions(
                              transactions.map((row) =>
                                row.id === t.id
                                  ? { ...row, categoryOverride: val }
                                  : row
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="p-2 text-right text-red-700 dark:text-red-400">
                        {currency(Math.abs(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {/* Finalize */}
      <section className="rounded border p-4 flex items-center justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-200">
          {allGood ? (
            <span>
              Everything checks out. Export your reconciliation artifacts.
            </span>
          ) : (
            <span>Fix mismatches above before finalizing.</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              downloadCSV(
                transactions.map((t) => ({
                  date: t.date, // MM/DD
                  description: t.description,
                  category: t.category ?? "",
                  amount: t.amount.toFixed(2),
                  raw: t.raw ?? "",
                  notes: t.notes ?? "",
                })),
                "reconciled-transactions.csv"
              )
            }
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Export CSV
          </button>
          <button
            onClick={finalizeReconciliation}
            disabled={!allGood}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            title="Save summary, CSV, and JSON snapshot"
          >
            Finalize Reconciliation
          </button>
        </div>
      </section>

      <footer className="text-xs text-gray-500">
        Dates show as <strong>MM/DD</strong>. We infer signs from
        description/merchants (default debit), split “Purchase with Cash Back”
        (spend + cash), and drop daily-balance lines.
      </footer>
    </div>
  );
}

/* ───────────────────────────────────────── UI Bits ───────────────────────────────────────── */

function SummaryCard({
  title,
  value,
  subtitle,
  status,
  delta,
}: {
  title: string;
  value: string;
  subtitle?: string;
  status: "ok" | "warn" | "error" | "na";
  delta?: string;
}) {
  const tone =
    status === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300"
      : status === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
      : status === "error"
      ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
      : "border-gray-300 bg-gray-50 text-gray-800 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200";

  const icon =
    status === "ok"
      ? "✅"
      : status === "warn"
      ? "⚠️"
      : status === "error"
      ? "❌"
      : "—";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-xl font-semibold flex items-center gap-2">
        {icon} {value}
      </div>
      {subtitle && <div className="text-xs opacity-80 mt-1">{subtitle}</div>}
      {delta && <div className="text-xs opacity-80 mt-1">{delta}</div>}
    </div>
  );
}
