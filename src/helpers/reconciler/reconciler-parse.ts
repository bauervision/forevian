import { applyAlias } from "@/lib/aliases";
import { applyCategoryRulesTo, readCatRules } from "@/lib/categoryRules";
import { rebuildFromPages } from "@/lib/import/reconcile";
import { StatementSnapshot, upsertStatement } from "@/lib/statements";
import { normalizePageText, NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { withCanonicalCategories } from "./reconciler-canon";

/** Recompute one statement with current rules (helper used during boot/switch) */
export function recomputeOneWithRules(s: StatementSnapshot, isDemo: boolean) {
  const rules = readCatRules();
  let txs = s.cachedTx ?? [];
  if ((!txs || !txs.length) && Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
    const pagesSanitized = (s.pagesRaw || []).map(normalizePageText);
    const res = rebuildFromPages(pagesSanitized, s.stmtYear, applyAlias);
    txs = res.txs;
  }
  const withRules = applyCategoryRulesTo(rules, txs, applyAlias);
  const normalized = withCanonicalCategories(withRules, { isDemo }); // *** CANON ***
  const nextSnap: StatementSnapshot = {
    ...s,
    cachedTx: normalized,
    normalizerVersion: Math.max(NORMALIZER_VERSION, s.normalizerVersion ?? 0),
  };
  upsertStatement(nextSnap);
  return nextSnap;
}
