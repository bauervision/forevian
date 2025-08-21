import { CatOverrideMap, keyForTx, readOverrides } from "../overrides";
import { extractCardLast4, stripAuthAndCard, userFromLast4 } from "../txEnrich";
import { ParsedLine, TxRow } from "../types";

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

function canonMerchant(desc: string, fallback: string | null) {
  return CANON.find(([rx]) => rx.test(desc))?.[1] ?? fallback ?? "Unknown";
}

function canonCategory(desc: string, merch?: string | null) {
  const m = (merch ?? "").toLowerCase();
  const dl = (desc ?? "").toLowerCase();

  // Credits / income first
  if (
    /\b(payroll|e\s*deposit|deposit|vacp\s*treas|ssa|irs\s*treas|ach\s*credit|zelle\s*(from|credit)|online\s*transfer\s*from|xfer\s*from|branch\s*deposit|mobile\s*deposit|credit\s*interest|interest\s*(payment|credit)|refund|reversal|return)\b/i.test(
      dl
    )
  )
    return "Income";

  // ---------- Amazon family (specific → general) ----------
  // Prime Video
  if (m === "prime video" || /\bprime\s*video\b/.test(dl)) return "Prime Video";

  // Amazon Fresh (grocery-ish, Prime Now, Whole Foods, AMZN tips)
  if (
    m === "amazon fresh" ||
    /\b(amazon\s*fresh|amazon\s*groc\w*|amzn\s*prime\s*now|prime\s*now|whole\s*foods)\b/.test(
      dl
    ) ||
    (/\bamzn\.?com\/bill\b/.test(dl) && /\btip(s)?\b/.test(dl))
  )
    return "Amazon Fresh";

  // Marketplace (catch-all for Amazon / AMZN / Mktp / Mark* / Amazon.com)
  if (
    m === "amazon marketplace" ||
    /\b(?:amzn|amazon)(?:\s*(?:mktp|market(?:place)?|mark\*|\.?com))?\b/.test(
      dl
    )
  )
    return "Amazon Marketplace";

  // ---------- your existing merchant-based rules ----------
  if (merch === "Newrez (Mortgage)") return "Housing";
  if (merch === "Truist Loan") return "Debt";
  if (
    /(Dominion Energy|Virginia Natural Gas|T-Mobile|Cox Communications)/i.test(
      merch ?? ""
    )
  )
    return "Utilities";
  if (/(Progressive Insurance|Pacific Life Insurance)/i.test(merch ?? ""))
    return "Insurance";
  if (
    /(HP Instant Ink|Apple\.com\/Bill|Adobe|Buzzsprout|Discovery\+|Netflix|School of Rock)/i.test(
      merch ?? ""
    )
  )
    return "Subscriptions";
  if (/(Harris Teeter|Food Lion)/i.test(merch ?? "")) return "Groceries";
  if (/Home Depot/i.test(merch ?? "")) return "Shopping/Household";
  if (/Chick-fil-A/i.test(merch ?? "")) return "Dining";
  if (/Cinema Cafe/i.test(merch ?? "")) return "Entertainment";
  if (/Target/i.test(merch ?? "")) return "Shopping/Household";
  if (/Fuel Station/i.test(merch ?? "")) return "Gas";

  // Description-based last
  if (/online\s*transfer|inst\s*xfer|xfer/i.test(dl)) return "Transfers";
  if (/cash\s*back/i.test(dl)) return "Cash Back";

  return "Impulse/Misc";
}

export function rebuildFromPages(
  pagesRaw: string[],
  stmtYear: number,
  applyAlias: (d: string) => string | null
): { txs: TxRow[] } {
  const IS_DATE_SOLO = /^\d{1,2}\/\d{1,2}\s*$/;
  const DATE_AT_START = /^\d{1,2}\/\d{1,2}\b/;
  const AMT_ONLY = /^\$?\s*\d[\d,]*\.\d{2}\s*$/;
  const AMT_INLINE_RX = /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/g;

  const PURCHASE_RX = /Purchase\s+authorized\s+on/i;
  const CASHBACK_RX = /Purchase\s+with\s+Cash\s*Back\b/i;

  const DEP_RX =
    /\b(pay\s*roll|direct\s*deposit|e\s*deposit|edeposit|ach\s*credit|vacp\s*treas|inst\s*xfer\s*from|irs\s*treas|ssa|mobile\s*deposit|branch\s*deposit|zelle\s*(from|credit))\b/i;

  const XFER_FROM_RX = /\b(online\s*)?(transfer|xfer)\s*(from)\b/i;
  const XFER_TO_RX = /\b(online\s*)?(transfer|xfer)\s*(to)\b/i;
  const ZELLE_FROM_RX = /\bzelle\b.*\b(from|credit)\b/i;
  const ZELLE_TO_RX = /\bzelle\b.*\b(to|payment)\b/i;
  const ACH_CREDIT_RX = /\bach\s*credit\b/i;
  const ACH_DEBIT_RX = /\bach\s*debit\b/i;
  const CARD_PAYMENT_RX =
    /\b(epay|e-?pay|card\s*payment|crd\s*epay|credit\s*card\s*pmt)\b/i;

  const parseIsoFromMmdd = (mmdd: string) => {
    const m = mmdd.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    return `${stmtYear}-${mm}-${dd}`;
  };

  const rows: ParsedLine[] = [];

  pagesRaw.forEach((raw) => {
    const L = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    let curDateIso: string | null = null;
    for (let i = 0; i < L.length; i++) {
      const line = L[i];

      if (IS_DATE_SOLO.test(line)) {
        curDateIso = parseIsoFromMmdd(line);
        continue;
      }

      if (
        /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Account\s+summary|Daily\s+(ending|ledger)\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i.test(
          line
        )
      )
        continue;

      let descriptor = line;
      let dispDate: string | null = curDateIso ? curDateIso.slice(5) : null;

      if (DATE_AT_START.test(line) && PURCHASE_RX.test(line)) {
        const md = line.match(/^\d{1,2}\/\d{1,2}/)![0];
        curDateIso = parseIsoFromMmdd(md);
        dispDate = md;
        descriptor = line.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
      }

      // find amount-only after this descriptor
      let amount: number | null = null;
      let amtIdx: number | null = null;
      let hasBalanceNext = false;

      for (let j = i + 1; j < L.length; j++) {
        const s = L[j];
        if (
          IS_DATE_SOLO.test(s) ||
          DATE_AT_START.test(s) ||
          /^(Beginning balance on|Ending balance on|Deposits\/Additions|Withdrawals\/Subtractions|Account\s+summary|Daily\s+(ending|ledger)\s+balance|Page\s+\d+\s+of\s+\d+|Fee\s+period)/i.test(
            s
          )
        )
          break;
        if (AMT_ONLY.test(s)) {
          amount = Number(s.replace(/[^0-9.]/g, ""));
          amtIdx = j;
          if (j + 1 < L.length && AMT_ONLY.test(L[j + 1]))
            hasBalanceNext = true;
          break;
        }
      }

      // inline fallback (prev+curr+next)
      if (amount == null) {
        const blob = [L[i - 1] || "", line, L[i + 1] || ""].join(" ");
        const nums = [...blob.matchAll(AMT_INLINE_RX)].map((m) =>
          Number(m[1].replace(/,/g, ""))
        );
        if (nums.length >= 1) amount = nums[0];
      }

      // cash back split
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

      if (amount == null) continue;

      const dlow = descriptor.toLowerCase();
      let signed = -Math.abs(amount); // default debit
      if (
        /\b(online\s*)?(transfer|xfer)\s*(from)\b/i.test(dlow) ||
        /\bzelle\b.*\b(from|credit)\b/i.test(dlow) ||
        /\bach\s*credit\b/i.test(dlow) ||
        /\b(payment\s*received|pmt\s*rcvd|thank\s*you)\b/i.test(dlow) ||
        /\b(refund|reversal|return)\b/i.test(dlow) ||
        /\b(credit\s*interest|interest\s*(payment|credit))\b/i.test(dlow) ||
        /\b(vacp\s*treas|us\s*treas|irs\s*treas|ssa|social\s*security|treasury)\b/i.test(
          dlow
        ) ||
        DEP_RX.test(dlow)
      ) {
        signed = Math.abs(amount); // credit
      }
      if (
        /\b(online\s*)?(transfer|xfer)\s*(to)\b/i.test(dlow) ||
        /\bzelle\b.*\b(to|payment)\b/i.test(dlow) ||
        /\bach\s*debit\b/i.test(dlow) ||
        /\b(epay|e-?pay|card\s*payment|crd\s*epay|credit\s*card\s*pmt)\b/i.test(
          dlow
        )
      ) {
        signed = -Math.abs(amount);
      }

      const dateDisplay = dispDate
        ? dispDate
        : curDateIso
        ? curDateIso.slice(5).replace("-", "/")
        : "";

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
