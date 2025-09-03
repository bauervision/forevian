// lib/import/run.ts

import { ImportProfile } from "./profile";

export type ParsedTx = {
  id: string;
  date: string; // MM/DD or MM/DD/YYYY normalized upstream
  description: string;
  amount: number; // signed
  cardLast4?: string;
};

/* ---------------- helpers ---------------- */

// Treat non-breaking / thin spaces as normal spaces
function normalizeSpaces(s: string) {
  return s.replace(/[\u00A0\u2007\u202F]+/g, " ");
}

// Skip statement summary rows entirely
const SUMMARY_RE =
  /\b(Beginning balance|Total credits|Total debits|Ending balance)\b/i;

function toSignedAmount(raw: string): number {
  const isParenNeg = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[(),$]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return isParenNeg ? -Math.abs(n) : n;
}

/** If a line ends "... <amount>   <balance>", prefer the left value as amount. */
function pickAmountFromEOL(s: string) {
  const line = normalizeSpaces(s);
  // Accepts $, commas, optional parentheses, and exactly 2 decimals on both columns
  const m = line.match(
    /(-?\(?\$?\d[\d,]*\.\d{2}\)?)\s+[ \t\u00A0\u2007\u202F]*(\(?\$?\d[\d,]*\.\d{2}\)?)\s*$/
  );
  if (!m) return null;
  const left = toSignedAmount(m[1]);
  const right = toSignedAmount(m[2]);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return { raw: m[1], amount: left, balanceRaw: m[2], balance: right };
}

function moneyTokens(s: string) {
  const line = normalizeSpaces(s);

  // 1) Strict money tokens: must include cents (most banks do)
  const strict = line.match(/\(?-?\$?\d[\d,]*\.\d{2}\)?/g) || [];

  // 2) Loose tokens fallback (kept for weird formats), but used only if strict fails
  const loose =
    line.match(
      /\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?|\(?-?\$?\d+(?:\.\d+)?\)?/g
    ) || [];

  const chosen = strict.length ? strict : loose;

  return chosen.map((raw) => {
    const isParenNeg = /^\(.*\)$/.test(raw);
    const cleaned = raw.replace(/[(),$]/g, "").replace(/,/g, "");
    const n = Number(cleaned);
    const val = isParenNeg ? -Math.abs(n) : n;
    return { raw, val };
  });
}

/** Prefer explicit 2-column tail; else decide from the last two numeric tokens. */
function pickAmount(tokens: { raw: string; val: number }[], line?: string) {
  // 1) Strong preference: explicit 2-column tail (amount, balance)
  if (line) {
    const eol = pickAmountFromEOL(line);
    if (eol) return eol;
  }

  // 2) Heuristic: use the last two *money* tokens (strict first, already handled in moneyTokens)
  if (tokens.length === 0)
    return { raw: "", amount: NaN, balanceRaw: "", balance: NaN };
  if (tokens.length === 1)
    return {
      raw: tokens[0].raw,
      amount: tokens[0].val,
      balanceRaw: "",
      balance: NaN,
    };

  const a = tokens[tokens.length - 2];
  const b = tokens[tokens.length - 1];

  // If signs differ → the signed (negative) one is the amount
  if (a.val < 0 && b.val >= 0)
    return { raw: a.raw, amount: a.val, balanceRaw: b.raw, balance: b.val };
  if (b.val < 0 && a.val >= 0)
    return { raw: b.raw, amount: b.val, balanceRaw: a.raw, balance: a.val };

  // Same sign → smaller magnitude is amount, larger is likely running balance
  const amt = Math.abs(a.val) <= Math.abs(b.val) ? a : b;
  const bal = amt === a ? b : a;
  return {
    raw: amt.raw,
    amount: amt.val,
    balanceRaw: bal.raw,
    balance: bal.val,
  };
}

function stripOnce(hay: string, needle: string) {
  if (!needle) return hay;
  const i = hay.indexOf(needle);
  if (i === -1) return hay;
  return (hay.slice(0, i) + hay.slice(i + needle.length))
    .replace(/\s+/g, " ")
    .trim();
}

function findFirstDateToken(s: string) {
  // 8/1, 08/01, 8-1, 08-01, with optional /YYYY or -YYYY
  const m = s.match(/\b(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\b/);
  return m ? m[1] : "";
}

function extractLast4FromLine(line: string) {
  const l4 =
    line.match(/\b(?:Card|CARD)\s+(\d{4})\b/)?.[1] ||
    line.match(/\b(?:CHK|Check|Acct)\s+(\d{3,4})\b/)?.[1] ||
    "";
  return l4 ? l4.slice(-4) : "";
}

/* ---------------- main ---------------- */

export function parseWithProfile(
  profile: ImportProfile,
  lines: string[]
): ParsedTx[] {
  const out: ParsedTx[] = [];

  // Naive fallback (when profile has no regex)
  if (!profile?.unifiedRegex) {
    lines.forEach((line, i) => {
      if (SUMMARY_RE.test(line)) return;

      const dateTok = (findFirstDateToken(line) || "").trim();
      const tokens = moneyTokens(line);
      const pick = pickAmount(tokens, line);
      if (!dateTok || Number.isNaN(pick.amount)) return;

      let desc = line;
      desc = stripOnce(desc, dateTok);
      desc = stripOnce(desc, pick.raw);

      const last4 = extractLast4FromLine(line);
      const amt = pick.amount;

      out.push({
        id: `tx-${i}-${dateTok}-${Math.abs(amt).toFixed(2)}`,
        date: dateTok,
        description: desc,
        amount: amt,
        cardLast4: last4 || undefined,
      });
    });
    return out;
  }

  // Learned-regex path
  const rx = new RegExp(profile.unifiedRegex, "mi");

  lines.forEach((line, i) => {
    if (SUMMARY_RE.test(line)) return;

    const m = line.match(rx);
    if (!m) {
      // --- Per-line fallback when the learned regex doesn't match ---
      const dateTok = (findFirstDateToken(line) || "").trim();
      const tokens = moneyTokens(line);
      const picked = pickAmount(tokens, line);
      if (!dateTok || Number.isNaN(picked.amount)) return;

      let desc = line;
      desc = stripOnce(desc, dateTok);
      desc = stripOnce(desc, picked.raw);

      const last4 = extractLast4FromLine(line);

      out.push({
        id: `tx-${i}-${dateTok}-${Math.abs(picked.amount).toFixed(2)}`,
        date: dateTok,
        description: desc,
        amount: picked.amount,
        cardLast4: last4 || undefined,
      });
      return;
    }

    // prefer named captures; fall back to index if needed
    // @ts-ignore - TS can't type named groups on RegExpMatchArray well
    const g = m.groups || {};
    const date = (g.date || m[1] || "").trim();
    let description = (g.description || m[2] || "").trim();
    const amountRaw = (g.amount || m[3] || "").trim();
    let last4 = (m.groups?.last4 ?? "").trim();

    // Validate last4 only if it appears in a proper fragment; otherwise try CHK/Acct pattern
    if (last4) {
      const cardFragRx = /\bCard(?:\s+ending\s+in|#|:)?\s*\*{0,4}\s*\b\d{4}\b/i;
      if (!cardFragRx.test(line)) last4 = "";
    }
    if (!last4) {
      last4 = extractLast4FromLine(line);
    }

    // Decide the amount from the raw line (EOL pair wins, else heuristic); fall back to regex-captured amount.
    const tokens = moneyTokens(line);
    const picked = pickAmount(tokens, line);
    const amount = Number.isNaN(picked.amount)
      ? toSignedAmount(amountRaw)
      : picked.amount;

    // If regex didn't capture description cleanly, rebuild from raw line
    if (!description) {
      let desc = line;
      const dateTok = findFirstDateToken(line);
      if (dateTok) desc = stripOnce(desc, dateTok);
      if (picked.raw) desc = stripOnce(desc, picked.raw);
      description = desc;
    }

    out.push({
      id: `tx-${i}-${date}-${Math.abs(amount).toFixed(2)}`,
      date,
      description,
      amount,
      cardLast4: last4 || undefined,
    });
  });

  return out;
}
