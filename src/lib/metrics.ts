// /lib/metrics.ts

export type Totals = {
  income: number;
  expense: number; // absolute (positive)
  net: number;
  byCategory: Record<string, number>;
  byMonth: Record<string, number>; // 'MM' -> net for now
  cashBack: number;
  trueSpend: number; // expense minus transfers/debt-servicing
};

export type MinimalTx = {
  id: string;
  date: string; // MM/DD (display)
  amount: number; // + deposit, - withdrawal
  category?: string | undefined; // original category
  categoryOverride?: string | undefined; // NEW: manual override
  description?: string | undefined;
};

const TRANSFER_LIKE = /transfer|xfer|tfr|zelle|from savings|to savings/i;
const DEBT_PAYMENT = /credit card payment|epay|loan|mortgage/i;
const CASH_BACK_CAT = /\bcash\s*back\b/i;

// Special-interest buckets
const AMAZON_RX = /\bamazon|amzn\.com\/bill|amazon\s*mktpl|prime\s*video\b/i;
const SUBS_RX =
  /\bsubscriptions?\b|apple\.com\/bill|netflix|discovery\+|adobe|hp\s*\*?instant\s*ink|buzzsprout|hulu|spotify|max\b|paramount|peacock/i;
const FASTFOOD_RX =
  /\b(chick-?fil-?a|mcdonald|wendy|taco\s*b(?:ell)?|kfc|subway|burger\s*king|zaxby|shake\s*shack|five\s*guys|chipotle|panera|panda\s*express|arby|culver|bojangles|popeyes|qdoba|domino|pizza\s*hut|little\s*caesars|jimmy\s*john|jersey\s*mike|sonic|dunkin|starbucks)\b/i;

// Helper: pick category with override
function catOf(r: MinimalTx) {
  return (r.categoryOverride ?? r.category ?? "Uncategorized").trim();
}

export function computeTotals(rows: MinimalTx[], opening = 0): Totals {
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let income = 0;
  let expense = 0; // negative while summing, flip at end
  let cashBack = 0;
  let trueSpend = 0;

  for (const r of rows) {
    const cat = catOf(r);
    const desc = r.description ?? "";

    byCategory[cat] = (byCategory[cat] ?? 0) + r.amount;

    const [mmRaw] = (r.date || "").split("/");
    const mm = (mmRaw ?? "").padStart(2, "0") || "??";
    byMonth[mm] = (byMonth[mm] ?? 0) + r.amount;

    if (r.amount > 0) income += r.amount;
    if (r.amount < 0) expense += r.amount;

    if (CASH_BACK_CAT.test(cat)) cashBack += Math.abs(r.amount);

    const nonBudget =
      TRANSFER_LIKE.test(cat) ||
      TRANSFER_LIKE.test(desc) ||
      DEBT_PAYMENT.test(cat) ||
      DEBT_PAYMENT.test(desc);

    if (r.amount < 0 && !nonBudget) trueSpend += Math.abs(r.amount);
  }

  return {
    income: +income.toFixed(2),
    expense: +(-expense).toFixed(2),
    net: +(income + expense).toFixed(2),
    byCategory,
    byMonth,
    cashBack: +cashBack.toFixed(2),
    trueSpend: +trueSpend.toFixed(2),
  };
}

// Extra helpers for the dashboard

export function bucketizeSpecials(rows: MinimalTx[]) {
  let amazon = 0,
    subs = 0,
    fastfood = 0,
    other = 0;

  for (const r of rows) {
    const cat = catOf(r);
    const desc = r.description ?? "";

    if (r.amount >= 0) continue; // only spend buckets here

    if (AMAZON_RX.test(desc) || cat === "Amazon") amazon += Math.abs(r.amount);
    else if (cat === "Subscriptions" || SUBS_RX.test(desc))
      subs += Math.abs(r.amount);
    else if (
      /Dining|Groceries|Impulse|Shopping|Gas|Entertainment|Utilities|Housing|Debt|Insurance|Travel|Fees|ATM|Kids|School/i.test(
        cat
      ) &&
      FASTFOOD_RX.test(desc)
    )
      fastfood += Math.abs(r.amount);
    else other += Math.abs(r.amount);
  }

  return {
    Amazon: +amazon.toFixed(2),
    Subscriptions: +subs.toFixed(2),
    "Fast Food": +fastfood.toFixed(2),
    Other: +other.toFixed(2),
  };
}

export function spendBySpender(rows: MinimalTx[]) {
  // Infer spender from last4 in description
  const who = (d: string) => {
    const m = d.match(/Card\s*(\d{4})/i)?.[1] ?? "";
    if (m === "5280") return "Mike";
    if (m === "0161") return "Beth";
    return "Unknown";
  };
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.amount >= 0) continue; // spending only
    const name = who(r.description ?? "");
    out[name] = (out[name] ?? 0) + Math.abs(r.amount);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, +v.toFixed(2)])
  );
}

export function recurringCandidates(rows: MinimalTx[]) {
  // Show likely recurring: Subscriptions, Housing, Utilities, Insurance, Debt
  const allowed = /^(Subscriptions|Housing|Utilities|Insurance|Debt)$/i;
  const byKey = new Map<
    string,
    { sum: number; count: number; days: number[] }
  >();

  for (const r of rows) {
    const cat = catOf(r);
    if (!allowed.test(cat)) continue;
    const d = r.description ?? "";
    const key = (d.match(/^[A-Za-z0-9&\-\.\s]{3,40}/)?.[0] || cat)
      .toLowerCase()
      .trim();

    const [mm, dd] = (r.date || "").split("/").map((x) => +x || 0);
    const bucket = byKey.get(key) ?? { sum: 0, count: 0, days: [] };
    bucket.sum += Math.abs(r.amount);
    bucket.count += 1;
    if (dd) bucket.days.push(dd);
    byKey.set(key, bucket);
  }

  const rowsOut = Array.from(byKey.entries())
    .map(([k, v]) => {
      // mode day-of-month as "draft day"
      const day = (() => {
        const counts: Record<number, number> = {};
        for (const d of v.days) counts[d] = (counts[d] ?? 0) + 1;
        let best = 0,
          bestC = 0;
        for (const [d, c] of Object.entries(counts)) {
          const dn = +d;
          if (c > bestC || (c === bestC && dn < best)) {
            best = dn;
            bestC = c;
          }
        }
        return best || (v.days[0] ?? 0);
      })();
      return {
        name: k.replace(/\s{2,}/g, " "),
        avg: +(v.sum / v.count).toFixed(2),
        count: v.count,
        draftDay: day || null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return rowsOut;
}
