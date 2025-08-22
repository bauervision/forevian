// lib/import/run.ts

import { ImportProfile } from "./profile";

export type ParsedTx = {
  id: string;
  date: string; // MM/DD
  description: string;
  amount: number; // signed; (123.45) -> -123.45 handled by learner
  cardLast4?: string;
};

function toSignedAmount(raw: string): number {
  // raw already normalized by learner (commas removed; parens -> -)
  const s = raw.replace(/,/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function parseWithProfile(
  profile: ImportProfile,
  lines: string[]
): ParsedTx[] {
  if (!profile?.unifiedRegex) return [];
  const rx = new RegExp(profile.unifiedRegex, "mi");

  const out: ParsedTx[] = [];
  lines.forEach((line, i) => {
    const m = line.match(rx);
    if (!m) return;

    // prefer named captures; fall back to index if needed
    // @ts-ignore - TS can't type named groups on RegExpMatchArray well
    const g = m.groups || {};
    const date = (g.date || m[1] || "").trim();
    const description = (g.description || m[2] || "").trim();
    const amountRaw = (g.amount || m[3] || "").trim();
    let last4 = (m.groups?.last4 ?? "").trim();

    // Validate: only keep last4 if it appears as part of a proper "Card ####" fragment
    if (last4) {
      const cardFragRx = /\bCard(?:\s+ending\s+in|#|:)?\s*\*{0,4}\s*\b\d{4}\b/i;
      if (!cardFragRx.test(line)) {
        last4 = ""; // drop false positives (e.g., from older profiles)
      }
    }

    const amount = toSignedAmount(amountRaw);

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
