// lib/import/run.ts
import { ImportProfile } from "@/lib/import/profile";

/** Normalized parsed row (amount is always positive; use `kind` for sign). */
export type ParsedRow = {
  id: string;
  date: string;
  description: string;
  amount: number; // positive
  kind: "withdrawal" | "deposit";
  cardLast4?: string;
  sourceLine: string;
};

/** Best-effort number parser: supports commas, (), leading +/- */
function parseAmountNumber(raw: string): { n: number; isNegative: boolean } {
  const s = (raw || "").trim();
  const paren = /^\(.*\)$/.test(s);
  const negSym = /^[^-]*-/.test(s);
  const cleaned = s.replace(/[(),]/g, "").replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  const isNegative = paren || negSym || n < 0;
  return { n: Math.abs(n), isNegative };
}

/** Quick date sanitize — leave as-is if it already looks OK */
function cleanDate(d: string): string {
  return (d || "").trim();
}

/** Generate stable-ish ids per line for table keys */
function rowId(line: string, idx: number) {
  return `${idx}-${Math.abs(hash(line)).toString(36)}`;
}
function hash(s: string): number {
  let h = 2166136261 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/**
 * Parse lines using a learned profile. Profile is expected to include a
 * single "unified" regex that exposes (preferably named) groups:
 *   (?<date>...) (?<description>...) (?<amount>...) (?<last4>...)?
 *
 * We tolerate profiles that didn't add names by falling back to positional
 * groups (1=date, 2=description, 3=amount, 4=last4).
 */
export function parseWithProfile(
  profile: ImportProfile,
  lines: string[]
): ParsedRow[] {
  const out: ParsedRow[] = [];
  if (!profile || !profile.unifiedRegex) return out;

  let rx: RegExp;
  try {
    rx = new RegExp(profile.unifiedRegex, "i");
  } catch {
    return out;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || "").trim();
    if (!line) continue;

    const m = line.match(rx);
    if (!m) continue;

    // Prefer named groups if present
    const g: Record<string, string> = (m as any).groups || {};
    const dateStr =
      g.date ??
      // positional fallback
      m[1] ??
      "";
    const descStr = g.description ?? g.desc ?? g.merchant ?? m[2] ?? "";
    const amtStr = g.amount ?? g.amt ?? m[3] ?? "";
    const last4Str = g.last4 ?? g.card ?? m[4] ?? "";

    const { n, isNegative } = parseAmountNumber(amtStr);
    const kind: ParsedRow["kind"] = isNegative ? "withdrawal" : "deposit";

    out.push({
      id: rowId(line, i),
      date: cleanDate(dateStr),
      description: (descStr || "").trim(),
      amount: n,
      kind,
      cardLast4: (last4Str || "").trim() || undefined,
      sourceLine: line,
    });
  }

  return out;
}
