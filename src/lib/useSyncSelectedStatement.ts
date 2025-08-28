// lib/useSyncSelectedStatement.ts
"use client";

import { useEffect } from "react";
import { useSelectedStatementId } from "@/lib/useClientSearchParams";
import { useReconcilerSelectors } from "@/app/providers/ReconcilerProvider";
import { readIndex } from "@/lib/statements";
import { readCatRules, applyCategoryRulesTo } from "@/lib/categoryRules";
import { applyAlias } from "@/lib/aliases";
import { normalizePageText, NORMALIZER_VERSION } from "@/lib/textNormalizer";
import { rebuildFromPages } from "@/lib/import/reconcile";

export function useSyncSelectedStatement() {
  const selectedId = useSelectedStatementId() ?? "";
  const { setTransactions, setInputs } = useReconcilerSelectors();

  useEffect(() => {
    if (!selectedId) return;

    const idx = readIndex();
    const s = idx[selectedId];
    if (!s) return;

    // keep inputs in sync
    setInputs({
      beginningBalance: s.inputs?.beginningBalance ?? 0,
      totalDeposits: s.inputs?.totalDeposits ?? 0,
      totalWithdrawals: s.inputs?.totalWithdrawals ?? 0,
    });

    // compute transactions for this statement
    if (Array.isArray(s.cachedTx) && s.cachedTx.length) {
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, s.cachedTx, applyAlias);
      setTransactions(withRules);
      return;
    }

    // fallback: rebuild from pages if needed
    if (Array.isArray(s.pagesRaw) && s.pagesRaw.length) {
      const pages = s.pagesRaw.map(normalizePageText);
      const res = rebuildFromPages(pages, s.stmtYear, applyAlias);
      const rules = readCatRules();
      const withRules = applyCategoryRulesTo(rules, res.txs, applyAlias);
      setTransactions(withRules);
      return;
    }

    // nothing parsed yet
    setTransactions([]);
  }, [selectedId, setInputs, setTransactions]);
}
