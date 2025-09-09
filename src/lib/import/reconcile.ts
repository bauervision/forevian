import { CatOverrideMap, keyForTx, readOverrides } from "../overrides";
import { extractCardLast4, stripAuthAndCard, userFromLast4 } from "../txEnrich";
import { TxRow } from "../types";

/* ---------------- Canonical merchant labels ---------------- */

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
  [/\bprime\s*video\b/i, "Prime Video"],
  [
    /\b(amazon\s*fresh|amazon\s*groc\w*|amzn\s*prime\s*now|prime\s*now|whole\s*foods)\b|(?:\bamzn\.?com\/bill\b.*\btip(s)?\b)/i,
    "Amazon Fresh",
  ],
  [
    /\b(?:amzn|amazon)(?:\s*(?:mktp|market(?:place)?|mark\*|\.?com))?\b/i,
    "Amazon Marketplace",
  ],
  [/bp#|shell\b|exxon|circle\s*k|7-?eleven|chevron/i, "Fuel Station"],
  [/adobe/i, "Adobe"],
  [/buzzsprout/i, "Buzzsprout"],
  [/ibm.*payroll/i, "IBM Payroll"],
  [/leidos.*payroll/i, "Leidos Payroll"],
  [/home\s*depot/i, "Home Depot"],
];

/* ---------------- Amount extraction helpers ---------------- */

// amount-only row (e.g., next line after descriptor)
const AMT_ONLY = /^\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*$/;

// inline amount inside the *same* descriptor line (rightmost wins)
const AMT_IN_DESC_RX = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))\b/g;

// sections/headers we never treat as transactions
const SECTION_HEADER_RX =
  /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Account\s+summary|Daily\s+(ending|ledger)\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i;

const DATE_AT_START = /^\d{1,2}\/\d{1,2}\b/;
const IS_DATE_SOLO = /^\d{1,2}\/\d{1,2}\s*$/;

const PURCHASE_RX = /Purchase\s+authorized\s+on/i;
const CASHBACK_RX = /Purchase\s+with\s+Cash\s*Back\b/i;

// deposit vs withdrawal hints
const DEP_RX =
  /\b(pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|ach\s*credit|vacp\s*treas|treas\s*310|inst\s*xfer\s*from|irs\s*treas|ssa|mobile\s*deposit|branch\s*deposit|zelle\s*(from|credit))\b/i;

const XFER_FROM_RX = /\b(online\s*)?(transfer|xfer)\s*(from)\b/i;
const XFER_TO_RX = /\b(online\s*)?(transfer|xfer)\s*(to)\b/i;
const ZELLE_FROM_RX = /\bzelle\b.*\b(from|credit)\b/i;
const ZELLE_TO_RX = /\bzelle\b.*\b(to|payment)\b/i;
const ACH_CREDIT_RX = /\bach\s*credit\b/i;
const ACH_DEBIT_RX = /\bach\s*debit\b/i;
const CARD_PAYMENT_RX =
  /\b(epay|e-?pay|card\s*payment|crd\s*epay|credit\s*card\s*pmt)\b/i;

type ParsedLine = {
  dateDisplay: string; // MM/DD
  description: string;
  amount: number;
  tag: "deposit" | "card_purchase" | "cb_cashback";
  parseNotes: string[];
};

function parseIsoFromMmdd(stmtYear: number, mmdd: string) {
  const m = mmdd.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return `${stmtYear}-${mm}-${dd}`;
}

function pickInlineAmountFromDescriptor(desc: string): number | null {
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = AMT_IN_DESC_RX.exec(desc)) !== null) last = m;
  if (!last) return null;
  const amtStr = (last[1] || "").replace(/,/g, "");
  const n = parseFloat(amtStr);
  return Number.isFinite(n) ? n : null;
}

function canonMerchant(desc: string, fallback: string | null) {
  return CANON.find(([rx]) => rx.test(desc))?.[1] ?? fallback ?? "Unknown";
}

function canonCategory(desc: string, merch?: string | null) {
  const dl = (desc ?? "").toLowerCase();

  // Credits / income (obvious signals only)
  if (
    /\b(payroll|e\s*deposit|deposit|vacp\s*treas|ssa|irs\s*treas|ach\s*credit|zelle\s*(from|credit)|online\s*transfer\s*from|xfer\s*from|branch\s*deposit|mobile\s*deposit|credit\s*interest|interest\s*(payment|credit)|refund|reversal|return)\b/i.test(
      dl
    )
  ) {
    return "Income/Payroll";
  }

  // Transfers or unclear → don't guess category
  if (/online\s*transfer|inst\s*xfer|xfer/i.test(dl)) return "Uncategorized";

  // Default: let rules + canonicalizer decide
  return "Uncategorized";
}

/* ---------------- Main parser ---------------- */

export function rebuildFromPages(
  pagesRaw: string[],
  stmtYear: number,
  applyAlias: (d: string) => string | null
): { txs: TxRow[] } {
  const rows: ParsedLine[] = [];

  pagesRaw.forEach((raw) => {
    const L = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    let curDateIso: string | null = null;

    for (let i = 0; i < L.length; i++) {
      const line = L[i];

      // Skip section headers entirely
      if (SECTION_HEADER_RX.test(line)) continue;

      // Date-only line sets current date
      if (IS_DATE_SOLO.test(line)) {
        curDateIso = parseIsoFromMmdd(stmtYear, line);
        continue;
      }

      // If a purchase-style descriptor starts with a date, extract it
      let descriptor = line;
      let dispDate: string | null = curDateIso
        ? (curDateIso.slice(5) as any)
        : null;

      if (DATE_AT_START.test(line) && PURCHASE_RX.test(line)) {
        const md = line.match(/^\d{1,2}\/\d{1,2}/)![0];
        curDateIso = parseIsoFromMmdd(stmtYear, md);
        dispDate = md;
        descriptor = line.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
      }

      // Find a *following* amount-only line (typical bank layout)
      let amount: number | null = null;
      let amtIdx: number | null = null;
      let hasBalanceNext = false;

      for (let j = i + 1; j < L.length; j++) {
        const s = L[j];
        if (
          IS_DATE_SOLO.test(s) ||
          DATE_AT_START.test(s) ||
          SECTION_HEADER_RX.test(s)
        )
          break;

        if (AMT_ONLY.test(s)) {
          amount = Number(s.replace(/[^0-9.]/g, ""));
          amtIdx = j;

          // If the very next line is also an amount-only, it's almost always the running balance → skip it
          if (j + 1 < L.length && AMT_ONLY.test(L[j + 1]))
            hasBalanceNext = true;
          break;
        }
      }

      // Inline amount fallback — ONLY within this descriptor line (never look at neighbors)
      if (amount == null) {
        const n = pickInlineAmountFromDescriptor(descriptor);
        if (n != null) amount = n;
      }

      // Cash back split (kept as-is)
      if (CASHBACK_RX.test(descriptor) && amount != null) {
        const cbM = descriptor.match(
          /cash\s*back\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})?)/i
        );
        const cashback = cbM ? Number(cbM[1].replace(/,/g, "")) : 0;
        const dateDisplay = dispDate
          ? dispDate
          : curDateIso
          ? curDateIso.slice(5).replace("-", "/")
          : "";

        const gross = amount;
        const spendPortion = Math.max(0, +(gross - cashback).toFixed(2));
        if (spendPortion > 0) {
          rows.push({
            dateDisplay,
            description: descriptor,
            amount: -spendPortion,
            tag: "card_purchase",
            parseNotes: ["cashback-split"],
          });
        }
        if (cashback > 0) {
          rows.push({
            dateDisplay,
            description: `${descriptor} (Cash back $${cashback.toFixed(2)})`,
            amount: -cashback,
            tag: "cb_cashback",
            parseNotes: ["cashback-split"],
          });
        }

        if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
        continue;
      }

      if (amount == null) continue; // couldn’t find an amount for this descriptor

      const dlow = descriptor.toLowerCase();

      // Default: debit (negative)
      let signed = -Math.abs(amount);

      // Credit hints → positive
      if (
        XFER_FROM_RX.test(dlow) ||
        ZELLE_FROM_RX.test(dlow) ||
        ACH_CREDIT_RX.test(dlow) ||
        /\b(payment\s*received|pmt\s*rcvd|thank\s*you)\b/i.test(dlow) ||
        /\b(refund|reversal|return)\b/i.test(dlow) ||
        /\b(credit\s*interest|interest\s*(payment|credit))\b/i.test(dlow) ||
        /\b(vacp\s*treas|treas\s*310|us\s*treas|irs\s*treas|ssa|social\s*security|treasury)\b/i.test(
          dlow
        ) ||
        DEP_RX.test(dlow)
      ) {
        signed = Math.abs(amount);
      }

      // Explicit debit hints → negative
      if (
        XFER_TO_RX.test(dlow) ||
        ZELLE_TO_RX.test(dlow) ||
        ACH_DEBIT_RX.test(dlow) ||
        CARD_PAYMENT_RX.test(dlow)
      ) {
        signed = -Math.abs(amount);
      }

      const dateDisplay =
        dispDate ?? (curDateIso ? curDateIso.slice(5).replace("-", "/") : "");

      rows.push({
        dateDisplay,
        description: descriptor,
        amount: signed,
        tag: signed > 0 ? "deposit" : "card_purchase",
        parseNotes: [],
      });

      if (amtIdx != null) i = amtIdx + (hasBalanceNext ? 1 : 0);
    }
  });

  // Map to TxRow + overrides
  const overrides: CatOverrideMap =
    typeof window !== "undefined" ? readOverrides() : {};

  const txs: TxRow[] = rows.map((r, idx) => {
    const rawDesc = r.description;
    const last4 = extractCardLast4(rawDesc);
    const cleaned = stripAuthAndCard(rawDesc);
    const aliasLabel =
      (typeof window !== "undefined" && (window as any).__applyAlias
        ? (window as any).__applyAlias(cleaned)
        : null) || null;

    const merch = aliasLabel ?? canonMerchant(cleaned, null);
    const baseCat =
      r.tag === "cb_cashback" ? "Cash Back" : canonCategory(cleaned, merch);
    const dateMMDD = r.dateDisplay || "";

    const k = keyForTx(dateMMDD, cleaned, r.amount);
    const categoryOverride = overrides[k];

    return {
      running: 0,
      id: `tx-${idx}-${dateMMDD}-${Math.abs(r.amount).toFixed(2)}`,
      date: dateMMDD,
      description: cleaned,
      amount: r.amount,
      category: baseCat,
      categoryOverride,
      cardLast4: last4,
      user: userFromLast4(last4),
      notes: r.parseNotes.join("; "),
    };
  });

  return { txs };
}
