export type Dir = "INCOME" | "EXPENSE";

// Merchant canonicalization (expanded)
const MERCHANT_MAP: Array<[RegExp, string]> = [
  [/newrez|shellpoin/i, "Newrez (Mortgage)"],
  [/truist\s*ln|auto\s*loan/i, "Truist Loan"],
  [/chase.*epay|chase\s*credit/i, "Chase Credit"],
  [/capital\s*one.*pmt|cap\s*one/i, "Capital One"],
  [/dominion\s*energy/i, "Dominion Energy"],
  [/virginia\s*natural\s*gas|vng/i, "Virginia Natural Gas"],
  [/cox\s*comm/i, "Cox Communications"],
  [/t-?mobile/i, "T-Mobile"],
  [/hp.*instant\s*ink/i, "HP Instant Ink"],
  [/apple\.com\/bill/i, "Apple.com/Bill"],
  [/adobe/i, "Adobe"],
  [/buzzsprout/i, "Buzzsprout"],
  [/discovery\+|discovery plus/i, "Discovery+"],
  [/netflix/i, "Netflix"],
  [/progressive|prog\s*gulf\s*ins/i, "Progressive Insurance"],
  [/pac.*life|pac-?life-?lyn-?inf/i, "Pacific Life Insurance"],
  [/school\s*of\s*rock/i, "School of Rock"],
  // Everyday merchants you called out:
  [/harris\s*te(?:eter)?|harris\s*te\b/i, "Harris Teeter"],
  [/food\s*lion/i, "Food Lion"],
  [/target\b|target\s*t-\s*\d+/i, "Target"],
  [/chick-?fil-?a/i, "Chick-fil-A"],
  [/cinema\s*cafe/i, "Cinema Cafe"],
  // credit-card bill payments (we’ll exclude these from the recurring calendar)
  [/chase.*epay|chase\s*credit/i, "Chase Credit Card Payment"],
  [/capital\s*one.*pmt|cap\s*one.*payment/i, "Capital One Credit Card Payment"],
  // deposits
  [/ibm.*payroll/i, "IBM Payroll"],
  [/leidos.*payroll/i, "Leidos Payroll"],
  // Amazon family
  [/amazon|amzn\.com\/bill|amazon\s*mktpl|prime\s*video/i, "Amazon"],
  // Fuel station generic
  [/bp#|shell\b|exxon|circle\s*k|7-?eleven|chevron/i, "Fuel Station"],
];

export function canonicalMerchant(desc: string): string | null {
  for (const [rx, name] of MERCHANT_MAP) if (rx.test(desc)) return name;
  return null;
}

// Category inference with those merchants
export function canonicalCategory(desc: string, fallback?: string): string {
  const d = desc.toLowerCase();
  const merch = canonicalMerchant(desc);
  if (merch === "Amazon") return "Amazon";
  if (/payroll|edeposit|deposit|vacp\s*treas/.test(d)) return "Transfers"; // income bucket

  // Hard categories by merchant
  if (merch === "Newrez (Mortgage)") return "Housing";
  if (/(truist|chase|capital one)/i.test(merch || "")) return "Debt";
  if (
    /(progressive|pacific life)/i.test(merch || "") ||
    /insurance|ins\s*prem/.test(d)
  )
    return "Insurance";
  if (
    /(dominion|virginia natural gas|t-mobile|cox)/i.test(merch || "") ||
    /water|sewer/.test(d)
  )
    return "Utilities";
  if (/(harris teeter|food lion)/i.test(merch || "")) return "Groceries";
  if (/(chick-fil-a)/i.test(merch || "")) return "Dining";
  if (/cinema\s*cafe/i.test(merch || "")) return "Entertainment";
  if (/target/.test(merch || "")) return "Shopping/Household";
  if (
    /hp.*instant\s*ink|apple\.com\/bill|adobe|buzzsprout|discovery\+|netflix/.test(
      d
    )
  )
    return "Subscriptions";
  if (/bp#|shell\b|exxon|circle\s*k|7-?eleven|chevron/.test(d)) return "Gas";

  if (/online\s*transfer|inst\s*xfer|xfer/.test(d)) return "Transfers";
  return fallback || "Impulse/Misc";
}

export function detectSpender(
  desc: string,
  cardLast4?: string
): "Mike" | "Beth" | "Unknown" {
  if (cardLast4 === "5280") return "Mike";
  if (cardLast4 === "0161") return "Beth";
  const d = desc.toLowerCase();
  if (/bauer,\s*beth|beth\s*bauer|\bbeth\b/.test(d)) return "Beth";
  if (/bauer,\s*micha|michael\s*bauer|\bmike\b/.test(d)) return "Mike";
  return "Unknown";
}

// Find “cash back $XX.xx” embedded in the description
export function extractCashBack(desc: string): number {
  const m = desc.match(/cash\s*back\s*\$?\s*([0-9]+(?:\.[0-9]{2})?)/i);
  return m ? parseFloat(m[1]) : 0;
}

// Stable key for recurrence grouping
export function recurrenceKey(desc: string): string {
  const months = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi;
  const m = canonicalMerchant(desc);
  if (m) return m.toLowerCase().replace(/\s+/g, "_");
  return desc
    .toLowerCase()
    .replace(months, "") // drop month names
    .replace(/card\s*\d{4}/g, "") // drop card last4
    .replace(/[\d\-\/\*\#]+/g, " ") // drop numeric noise
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, "_");
}
