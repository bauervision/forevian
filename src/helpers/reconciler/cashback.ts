// helpers/reconciler/cashback.ts

/** Extracts the explicit cash–back amount from the description, if present. */
export function parseCashBackAmount(desc: string): number | null {
  // catches: "with Cash Back $ 10.00", "with cash back $10.00", etc.
  const m = (desc || "").match(
    /with\s+cash\s*back\s*\$?\s*([0-9]+(?:\.[0-9]{2})?)/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? +n.toFixed(2) : null;
}

/** Returns true only for the *cash-back* line (the small withdrawal that equals the parsed amount). */
export function isCashBackLine(amount: number, desc: string): boolean {
  const cb = parseCashBackAmount(desc);
  if (cb == null) return false;
  // treat exact match within 1 cent as "the cash back line"
  return Math.abs(Math.abs(amount) - cb) <= 0.01;
}

/** Convenience: does the description even mention "with cash back"? */
function hasCashBackPhrase(desc: string): boolean {
  return /\bwith\s+cash\s*back\b/i.test(desc || "");
}

/**
 * Ensure only the true cash-back line is tagged "Cash Back".
 * - Tags the matching withdrawal with categoryOverride = "Cash Back".
 * - If a sibling “with cash back …” line is *not* the matching amount,
 *   and it was incorrectly overridden to "Cash Back", we clear that override.
 * - Respects user overrides to *other* categories (we do not clobber them).
 */
export function tagCashBackLine<
  T extends {
    amount?: number;
    description?: string;
    category?: string;
    categoryOverride?: string;
  }
>(rows: T[]): T[] {
  const CB = "Cash Back";

  return rows.map((r) => {
    const amt = r.amount ?? 0;
    const desc = r.description ?? "";
    const overridden = (r.categoryOverride ?? "").trim().toLowerCase();
    const base = (r.category ?? "").trim().toLowerCase();
    const isWithdrawal = amt < 0;

    // Only consider withdrawals that mention cash back
    if (!isWithdrawal || !hasCashBackPhrase(desc)) return r;

    const isTheCashBack = isCashBackLine(amt, desc);

    // If this is the *true* cash-back line: set override to "Cash Back" unless user already set something else.
    if (isTheCashBack) {
      if (overridden && overridden !== CB.toLowerCase()) {
        // Respect user’s explicit non-cashback override.
        return r;
      }
      if (base === CB.toLowerCase() && !r.categoryOverride) {
        // Already effectively Cash Back via base category—no change.
        return r;
      }
      return { ...r, categoryOverride: CB };
    }

    // Otherwise (same phrase but not the matching amount):
    // If it was mistakenly tagged as Cash Back via override, clear that override.
    if (overridden === CB.toLowerCase()) {
      // Preserve base category; just remove the incorrect override
      return { ...r, categoryOverride: undefined as any };
    }

    return r;
  });
}
