import {
  readIndex,
  StatementSnapshot,
  upsertStatement,
} from "@/lib/statements";
import { anyIntersect, merchantTokenSet } from "./tokenizer";
import { readCatRules } from "@/lib/categoryRules";
import { NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { recomputeOneWithRules } from "./reconciler-parse";

export function bulkApplyOverrideAcrossAllStatements(
  anchorDesc: string,
  label: string,
  isDemo: boolean
) {
  const anchorTokens = merchantTokenSet(anchorDesc || "");
  if (!anchorTokens.size) return;

  const idx = readIndex();
  readCatRules(); // ensure rules loaded

  for (const id of Object.keys(idx)) {
    const s = idx[id];

    // Start from rules-applied + canonicalized snapshot
    const snap = recomputeOneWithRules(s, isDemo); // *** CANON inside ***
    const txs = Array.isArray(snap.cachedTx) ? snap.cachedTx : [];

    // Find candidates in this statement by token intersection
    const candidates = txs.filter(
      (r) =>
        (r.amount ?? 0) < 0 &&
        (r.description || "").trim() &&
        anyIntersect(anchorTokens, merchantTokenSet(r.description || ""))
    );

    if (!candidates.length) continue;

    const idSet = new Set(candidates.map((r) => r.id));
    const updated = txs.map((r) =>
      idSet.has(r.id) ? { ...r, categoryOverride: label } : r
    );

    const nextSnap: StatementSnapshot = {
      ...snap,
      cachedTx: updated, // overrides don't change base cat, so no need to re-canon here
      normalizerVersion: Math.max(
        NORMALIZER_VERSION,
        snap.normalizerVersion ?? 0
      ),
    };
    upsertStatement(nextSnap);
  }
}
