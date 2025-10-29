// lib/reconciler-canon.ts
import { normalizeToCanonical } from "@/lib/categories/normalization";
import type { TxRow } from "@/lib/types";

/** Read the effective category for a row (override → base → fallback). */
export function catOf(
  t: Partial<TxRow> & { category?: string; categoryOverride?: string }
) {
  return (t.categoryOverride ?? t.category ?? "Uncategorized").trim();
}

/** Alias if you prefer the name elsewhere. */
export const effectiveCategory = catOf;

/** Canonicalize a single row’s base category (does not touch overrides). */
export function canonicalizeTxRow<T extends TxRow>(
  t: T,
  opts: { isDemo: boolean }
): T {
  return {
    ...t,
    category: normalizeToCanonical(t.category, {
      isDemo: opts.isDemo,
      description: t.description,
      merchant: (t as any).merchant,
      mcc: (t as any).mcc,
    }),
  };
}

/** Canonicalize all rows (lightweight, idempotent). */
export function withCanonicalCategories<T extends TxRow>(
  txs: T[],
  opts: { isDemo: boolean }
): T[] {
  return txs.map((t) => canonicalizeTxRow(t, opts));
}
